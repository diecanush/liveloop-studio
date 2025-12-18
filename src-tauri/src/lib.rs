mod dmx;

use dmx::{dmx_list_ports, dmx_set_levels, DmxState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_serialplugin::init())
        .manage(DmxState::default())
        .invoke_handler(tauri::generate_handler![dmx_list_ports, dmx_set_levels])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            app.handle().plugin(tauri_plugin_dialog::init())?;
            app.handle().plugin(tauri_plugin_fs::init())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
