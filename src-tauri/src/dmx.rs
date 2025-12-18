use log::{debug, error, info};
use serde::Serialize;
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager, State, Wry};
use tauri_plugin_serialplugin::state::{DataBits, FlowControl, Parity, StopBits, UNKNOWN};
use tauri_plugin_serialplugin::SerialPort;

#[derive(Clone, Default)]
struct DmxSharedState {
    port_path: Arc<Mutex<Option<String>>>,
    open_port: Arc<Mutex<Option<String>>>,
    levels: Arc<Mutex<[u8; 513]>>, // Start code + 512 channels
    write_lock: Arc<Mutex<()>>,
}

impl DmxSharedState {
    fn set_port(&self, port: String) -> Result<(), String> {
        let mut path_guard = self
            .port_path
            .lock()
            .map_err(|e| format!("No se pudo bloquear el puerto seleccionado: {e}"))?;
        *path_guard = Some(port);
        Ok(())
    }

    fn update_levels(&self, levels: &[u8]) -> Result<(), String> {
        if levels.len() > 512 {
            return Err("El buffer DMX debe tener 512 canales como máximo".to_string());
        }

        let mut buffer = self
            .levels
            .lock()
            .map_err(|e| format!("No se pudo bloquear el buffer DMX: {e}"))?;

        buffer.fill(0);
        for (idx, value) in levels.iter().take(512).enumerate() {
            buffer[idx + 1] = *value;
        }

        Ok(())
    }

    fn snapshot_levels(&self) -> Vec<u8> {
        self.levels
            .lock()
            .map(|levels| levels.to_vec())
            .unwrap_or_else(|_| vec![0; 513])
    }

    fn clear_open_port(&self) {
        if let Ok(mut open) = self.open_port.lock() {
            *open = None;
        }
    }
}

#[derive(Default)]
pub struct DmxState {
    shared: DmxSharedState,
    stop_tx: Mutex<Option<Sender<()>>>,
    writer_handle: Mutex<Option<thread::JoinHandle<()>>>,
}

#[derive(Serialize)]
pub struct DmxPortInfo {
    path: String,
    kind: Option<String>,
    manufacturer: Option<String>,
    product: Option<String>,
    serial_number: Option<String>,
}

#[tauri::command]
pub fn dmx_list_ports(serial: State<'_, SerialPort<Wry>>) -> Result<Vec<DmxPortInfo>, String> {
    let mut ports = serial
        .available_ports()
        .map_err(|e| format!("No se pudieron listar los puertos: {e}"))?
        .into_iter()
        .map(|(path, meta)| DmxPortInfo {
            path,
            kind: meta.get("type").cloned().filter(|t| t != UNKNOWN),
            manufacturer: meta.get("manufacturer").cloned().filter(|m| m != UNKNOWN),
            product: meta.get("product").cloned().filter(|p| p != UNKNOWN),
            serial_number: meta.get("serial_number").cloned().filter(|s| s != UNKNOWN),
        })
        .collect::<Vec<_>>();

    ports.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(ports)
}

#[tauri::command]
pub fn dmx_set_levels(
    app_handle: AppHandle,
    state: State<'_, DmxState>,
    port_path: String,
    levels: Vec<u8>,
) -> Result<(), String> {
    state.shared.set_port(port_path)?;
    state.shared.update_levels(&levels)?;
    state.ensure_writer(app_handle)?;
    Ok(())
}

impl DmxState {
    fn ensure_writer(&self, app_handle: AppHandle) -> Result<(), String> {
        let mut writer_guard = self
            .writer_handle
            .lock()
            .map_err(|e| format!("No se pudo preparar el hilo DMX: {e}"))?;

        if writer_guard.is_some() {
            return Ok(());
        }

        let (tx, rx) = mpsc::channel();
        {
            let mut stop_guard = self
                .stop_tx
                .lock()
                .map_err(|e| format!("No se pudo instalar el canal de parada: {e}"))?;
            *stop_guard = Some(tx);
        }

        let shared = self.shared.clone();

        let handle = thread::spawn(move || loop {
            if rx.try_recv().is_ok() {
                info!("Cerrando loop DMX por señal de parada");
                break;
            }

            let target_port = match shared.port_path.lock() {
                Ok(guard) => guard.clone(),
                Err(err) => {
                    error!("No se pudo leer el puerto DMX: {err}");
                    thread::sleep(Duration::from_millis(200));
                    continue;
                }
            };

            if let Some(port_path) = target_port {
                let serial = app_handle.state::<SerialPort<Wry>>();

                let needs_open = match shared.open_port.lock() {
                    Ok(opened) => opened.as_deref() != Some(port_path.as_str()),
                    Err(err) => {
                        error!("No se pudo comprobar el estado del puerto DMX: {err}");
                        true
                    }
                };

                if needs_open {
                    match serial.open(
                        port_path.clone(),
                        250000,
                        Some(DataBits::Eight),
                        Some(FlowControl::None),
                        Some(Parity::None),
                        Some(StopBits::Two),
                        Some(100),
                    ) {
                        Ok(_) => {
                            info!("Puerto DMX abierto: {}", port_path);
                            if let Ok(mut open) = shared.open_port.lock() {
                                *open = Some(port_path.clone());
                            }
                        }
                        Err(err) => {
                            error!("No se pudo abrir el puerto DMX {}: {err}", port_path);
                            shared.clear_open_port();
                            thread::sleep(Duration::from_millis(500));
                            continue;
                        }
                    }
                }

                let frame = shared.snapshot_levels();

                if let Ok(_guard) = shared.write_lock.lock() {
                    if let Err(err) = serial.set_break(port_path.clone()) {
                        error!("No se pudo iniciar el break DMX en {}: {err}", port_path);
                        shared.clear_open_port();
                    } else {
                        thread::sleep(Duration::from_micros(110));
                        if let Err(err) = serial.clear_break(port_path.clone()) {
                            error!("No se pudo limpiar el break DMX en {}: {err}", port_path);
                            shared.clear_open_port();
                        }

                        thread::sleep(Duration::from_micros(12));

                        if let Err(err) = serial.write_binary(port_path.clone(), frame.clone()) {
                            error!("Error al escribir frame DMX en {}: {err}", port_path);
                            shared.clear_open_port();
                        } else {
                            debug!("Frame DMX enviado a {} ({} bytes)", port_path, frame.len());
                        }
                    }
                }
            }

            thread::sleep(Duration::from_millis(25));
        });

        *writer_guard = Some(handle);
        Ok(())
    }
}
