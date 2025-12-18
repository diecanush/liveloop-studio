import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Send, Zap, Usb } from 'lucide-react';
import type { DmxPortInfo } from '../types';
import { listDmxPorts, sendDmxLevels } from '../utils/dmx';

const createEmptyLevels = () => new Array(512).fill(0);

const formatPortLabel = (port: DmxPortInfo) => {
  const details = [port.product, port.manufacturer, port.kind]
    .filter(Boolean)
    .join(' · ');
  return details ? `${port.path} — ${details}` : port.path;
};

const DmxPanel: React.FC = () => {
  const [ports, setPorts] = useState<DmxPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [dmxLevels, setDmxLevels] = useState<number[]>(createEmptyLevels);
  const [selectedChannel, setSelectedChannel] = useState(1);
  const [status, setStatus] = useState('Selecciona un puerto DMX para empezar');
  const [isLoading, setIsLoading] = useState(false);

  const selectedValue = useMemo(() => dmxLevels[selectedChannel - 1] ?? 0, [dmxLevels, selectedChannel]);

  const refreshPorts = useCallback(async () => {
    setIsLoading(true);
    try {
      const available = await listDmxPorts();
      setPorts(available);

      if (!selectedPort && available.length > 0) {
        setSelectedPort(available[0].path);
      }
      if (available.length === 0) {
        setStatus('No se detectaron interfaces DMX/USB disponibles');
      }
    } catch (error) {
      console.error('Error listing DMX ports', error);
      setStatus('No se pudo listar los puertos. Revisa permisos o drivers.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPort]);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  const pushLevels = useCallback(async () => {
    if (!selectedPort) {
      setStatus('Selecciona un puerto antes de enviar niveles');
      return;
    }

    setIsLoading(true);
    try {
      await sendDmxLevels(selectedPort, dmxLevels);
      setStatus('Reenviando frames DMX a 40Hz');
    } catch (error) {
      console.error('Error sending DMX levels', error);
      setStatus('No se pudieron enviar los niveles DMX');
    } finally {
      setIsLoading(false);
    }
  }, [selectedPort, dmxLevels]);

  useEffect(() => {
    if (!selectedPort) return;
    const timeout = setTimeout(() => {
      pushLevels();
    }, 200);

    return () => clearTimeout(timeout);
  }, [dmxLevels, selectedPort, pushLevels]);

  const handleChannelChange = (value: number) => {
    const channel = Math.min(512, Math.max(1, value));
    setSelectedChannel(channel);
  };

  const handleLevelChange = (value: number) => {
    const next = Math.min(255, Math.max(0, value));
    setDmxLevels((prev) => {
      const updated = [...prev];
      updated[selectedChannel - 1] = next;
      return updated;
    });
  };

  const applyToAll = () => {
    setDmxLevels((prev) => prev.map(() => selectedValue));
  };

  return (
    <div className="bg-studio-800 border border-studio-700 rounded-lg p-4 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-gray-100 font-semibold">
          <Zap size={18} className="text-studio-accent" />
          <span>DMX / Iluminación</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshPorts}
            className="flex items-center gap-2 bg-studio-700 hover:bg-studio-600 text-sm px-3 py-1.5 rounded"
          >
            <RefreshCw size={14} />
            Buscar puertos
          </button>
          <button
            onClick={pushLevels}
            disabled={!selectedPort || isLoading}
            className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded ${selectedPort ? 'bg-studio-accent text-studio-900 hover:bg-yellow-400' : 'bg-studio-700 text-studio-500 cursor-not-allowed'}`}
          >
            <Send size={14} />
            Enviar ahora
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <label className="text-xs uppercase tracking-wide text-studio-500 font-semibold">Puerto DMX</label>
          <div className="flex items-center gap-2">
            <Usb size={16} className="text-studio-500" />
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="flex-1 bg-studio-900 border border-studio-700 rounded px-3 py-2 text-sm text-gray-200"
            >
              <option value="">Selecciona un puerto</option>
              {ports.map((port) => (
                <option key={port.path} value={port.path}>
                  {formatPortLabel(port)}
                </option>
              ))}
            </select>
          </div>

          <div className="text-xs text-studio-500 leading-relaxed space-y-2">
            <p className="text-gray-300">Dispositivos compatibles: Enttec OpenDMX, DMXKing, adaptadores FTDI/CH340.</p>
            <p>Parámetros: 250000 baud, 8N2, sin control de flujo. El plugin mantiene el frame activo a 40Hz.</p>
          </div>

          <div className="text-sm text-studio-400 bg-studio-900 border border-studio-700 rounded px-3 py-2">
            {isLoading ? 'Conectando...' : status}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-studio-500 font-semibold">
            <span>Canal seleccionado</span>
            <span className="text-studio-400">1 - 512</span>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={512}
              value={selectedChannel}
              onChange={(e) => handleChannelChange(Number(e.target.value))}
              className="w-20 bg-studio-900 border border-studio-700 rounded px-2 py-2 text-gray-200"
            />
            <input
              type="range"
              min={0}
              max={255}
              value={selectedValue}
              onChange={(e) => handleLevelChange(Number(e.target.value))}
              className="flex-1 accent-studio-accent"
            />
            <input
              type="number"
              min={0}
              max={255}
              value={selectedValue}
              onChange={(e) => handleLevelChange(Number(e.target.value))}
              className="w-20 bg-studio-900 border border-studio-700 rounded px-2 py-2 text-gray-200"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-studio-500">
            <span>Los cambios se envían automáticamente al loop de 40Hz.</span>
            <button
              onClick={applyToAll}
              className="text-studio-accent hover:text-yellow-300 font-semibold"
            >
              Aplicar a todos
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DmxPanel;
