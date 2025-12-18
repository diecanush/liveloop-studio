import React from 'react';
import { Zap, Lightbulb, Link, Link2, Power, Radio } from 'lucide-react';
import type { DMXScene, StudioItem } from '../types';

interface DMXConsoleProps {
  levels: number[];
  onChangeLevel: (index: number, value: number) => void;
  onBlackout: () => void;
  onFull: () => void;
  selectedInterface: string;
  availableInterfaces: string[];
  onInterfaceChange: (value: string) => void;
  status: { state: 'idle' | 'sending' | 'ok' | 'error'; message: string };
  scenes: DMXScene[];
  activeSceneId: string | null;
  onCreateScene: () => void;
  onRecordScene: (id: string) => void;
  onRecallScene: (id: string) => void;
  onUpdateScene: (id: string, updates: Partial<DMXScene>) => void;
  items: StudioItem[];
}

const colorPalette = ['#fb7185', '#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#f472b6', '#fb923c', '#eab308'];

const DMXConsole: React.FC<DMXConsoleProps> = ({
  levels,
  onChangeLevel,
  onBlackout,
  onFull,
  selectedInterface,
  availableInterfaces,
  onInterfaceChange,
  status,
  scenes,
  activeSceneId,
  onCreateScene,
  onRecordScene,
  onRecallScene,
  onUpdateScene,
  items
}) => {
  const renderFaders = () => {
    const faders = [];
    const count = Math.min(48, levels.length);
    for (let i = 0; i < count; i++) {
      const value = levels[i] ?? 0;
      faders.push(
        <div key={i} className="flex flex-col items-center gap-2 bg-studio-800/60 rounded-md p-2 border border-studio-700/70">
          <span className="text-[10px] text-studio-400">Ch {i + 1}</span>
          <div className="relative h-32 flex items-center">
            <input
              type="range"
              min={0}
              max={255}
              value={value}
              onChange={(e) => onChangeLevel(i, parseInt(e.target.value, 10) || 0)}
              className="w-28 h-2 rotate-[-90deg] origin-center appearance-none bg-studio-900 rounded"
              style={{ accentColor: '#fbb300' }}
            />
          </div>
          <div className="text-[10px] text-gray-200 font-mono">{value}</div>
        </div>
      );
    }
    return faders;
  };

  const renderScenes = () => {
    if (scenes.length === 0) {
      return (
        <div className="text-sm text-studio-400 border border-dashed border-studio-700 rounded-md p-4 text-center">
          No hay escenas guardadas todavía.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {scenes.map((scene, idx) => (
          <div
            key={scene.id}
            className={`bg-studio-800/70 border rounded-md p-3 space-y-2 transition-shadow ${activeSceneId === scene.id ? 'border-white/40 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]' : 'border-studio-700/70'}`}
            style={{ boxShadow: activeSceneId === scene.id ? `0 0 0 1px ${scene.color} inset` : undefined }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={scene.color}
                  onChange={(e) => onUpdateScene(scene.id, { color: e.target.value })}
                  className="w-8 h-8 rounded-full border border-studio-600 bg-transparent"
                  title="Color de la escena"
                />
                <input
                  type="text"
                  value={scene.name}
                  onChange={(e) => onUpdateScene(scene.id, { name: e.target.value })}
                  className="bg-studio-900/70 border border-studio-700 rounded px-2 py-1 text-sm w-full"
                  placeholder={`Escena ${idx + 1}`}
                />
              </div>
              {activeSceneId === scene.id && (
                <span className="text-[10px] uppercase tracking-[0.08em] text-studio-accent font-semibold">Activa</span>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-studio-300">
              <Link size={14} className="text-studio-500" />
              <select
                value={scene.linkedItemId || ''}
                onChange={(e) => onUpdateScene(scene.id, { linkedItemId: e.target.value || null })}
                className="bg-studio-900 border border-studio-700 rounded px-2 py-1 text-sm flex-1"
              >
                <option value="">Sin vincular</option>
                {items.map(item => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onRecordScene(scene.id)}
                className="flex-1 flex items-center justify-center gap-1 bg-studio-700 hover:bg-studio-600 text-white text-sm py-1.5 rounded"
              >
                <Link2 size={14} />
                Grabar
              </button>
              <button
                onClick={() => onRecallScene(scene.id)}
                className="flex-1 flex items-center justify-center gap-1 bg-studio-accent text-studio-900 text-sm py-1.5 rounded font-semibold hover:bg-yellow-400"
              >
                <Zap size={14} />
                Recuperar
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-studio-900/80 border border-studio-800 rounded-xl p-4 mb-6 space-y-4 shadow-xl">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-studio-accent">
            <Radio size={18} />
            <div>
              <p className="text-sm font-semibold">DMX Console</p>
              <p className="text-[11px] text-studio-400">48 faders + escenas</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-studio-300">
            <div className={`px-2 py-1 rounded-full border text-[10px] ${status.state === 'error' ? 'border-red-500 text-red-400' : status.state === 'ok' ? 'border-green-500 text-green-400' : 'border-studio-700 text-studio-400'}`}>
              {status.state === 'sending' ? 'Enviando…' : status.message}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedInterface}
            onChange={(e) => onInterfaceChange(e.target.value)}
            className="bg-studio-800 border border-studio-700 rounded px-3 py-2 text-sm text-gray-100"
          >
            {availableInterfaces.map(intf => (
              <option key={intf} value={intf}>{intf}</option>
            ))}
          </select>
          <button
            onClick={onBlackout}
            className="flex items-center gap-1 px-3 py-2 rounded bg-studio-800 border border-studio-700 text-sm text-red-300 hover:border-red-400/60 hover:text-red-200"
          >
            <Power size={14} />
            Blackout
          </button>
          <button
            onClick={onFull}
            className="flex items-center gap-1 px-3 py-2 rounded bg-studio-accent text-studio-900 text-sm font-semibold hover:bg-yellow-400"
          >
            <Lightbulb size={14} />
            Full
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {renderFaders()}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center gap-2 text-xs text-studio-400">
          <span className="w-2 h-2 rounded-full bg-studio-600"></span>
          <span>Niveles se envían automáticamente al backend</span>
        </div>
        <button
          onClick={onCreateScene}
          className="px-3 py-1.5 rounded bg-studio-700 text-sm text-white hover:bg-studio-600"
        >
          Nueva escena
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-6 rounded-full" style={{ background: scenes[0]?.color || colorPalette[0] }}></div>
          <p className="text-sm font-semibold text-gray-100">Escenas</p>
          <p className="text-xs text-studio-400">Color + vinculación a tarjetas</p>
        </div>
        {renderScenes()}
      </div>
    </div>
  );
};

export default DMXConsole;
