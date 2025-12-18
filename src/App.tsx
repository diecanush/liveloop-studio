import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Plus, Save, FolderOpen, AlertCircle, PlayCircle, Music, Keyboard } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';

import AudioCard from './components/AudioCard';
import SortableItem from './components/SortableItem';
import type { TrackData, AudioCardHandle, SavedSession, StudioItem } from './types';

import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { convertFileSrc } from '@tauri-apps/api/core';

// Simple UUID generator fallback
const generateId = () => uuidv4();

const App: React.FC = () => {
  console.log("App component mounting...");
  // Unified State
  const [items, setItems] = useState<StudioItem[]>([]);


  const [sessionName, setSessionName] = useState("My Set");
  const trackRefs = useRef<{ [key: string]: AudioCardHandle | null }>({});
  const [showKeyMapHint, setShowKeyMapHint] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);


  // DnD Sensors
  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // -- Track Management --

  // -- Track Management --

  const handleAddFiles = async () => {
    try {
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Audio',
          extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a']
        }]
      });

      if (selected) {
        // 'selected' is string[] (paths) or null
        const paths = Array.isArray(selected) ? selected : [selected];

        const newTracks: TrackData[] = paths.map((path) => {
          // Extract filename from path
          // Windows path separator is \, but we might get / from dialog depending on OS.
          // Let's handle both or use a simple regex.
          const name = path.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || "Untitled";

          return {
            id: generateId(),
            type: 'audio',
            name: name,
            fileUrl: convertFileSrc(path), // Convert to asset protocol URL
            path: path, // Store original path for persistence
            volume: 0.8,
            startPoint: 0,
            isLooping: false,
            assignedKey: null,
            duration: 0
          };
        });
        setItems(prev => [...prev, ...newTracks]);
      }
    } catch (err) {
      console.error("Failed to open files", err);
    }
  };

  const handleUpdateTrack = useCallback((id: string, updates: Partial<TrackData>) => {
    setItems(prev => prev.map(item => {
      if (item.id === id && item.type === 'audio') {
        return { ...item, ...updates };
      }
      return item;
    }));
  }, []);

  const handleRemoveItem = (id: string) => {
    // Revoke blob url if it's an audio track
    const item = items.find(t => t.id === id);
    if (item && item.type === 'audio') {
      URL.revokeObjectURL(item.fileUrl);
      delete trackRefs.current[id];
    }

    setItems(prev => prev.filter(t => t.id !== id));
  };



  // -- Playback Logic --

  const handlePlayRequest = useCallback((targetId: string, shiftKey: boolean) => {
    const targetRef = trackRefs.current[targetId];

    if (!shiftKey) {
      // Exclusive mode: Stop others
      Object.entries(trackRefs.current).forEach(([id, ref]) => {
        const handle = ref as AudioCardHandle | null;
        if (id !== targetId && handle && handle.isPlaying()) {
          handle.stop(); // Or ref.pause() if you prefer pausing
        }
      });
    }

    // Play target
    if (targetRef) {
      targetRef.play();
    }
  }, []);

  // -- Keyboard Shortcuts --

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Spacebar to Pause/Play Selected or Stop All?
      // User said: "pausar con la barra espaciadora"
      // Let's make Space toggle play/pause of the SELECTED track if any, or maybe the last active one?
      // Or maybe just pause ALL? "pausar" usually implies pause.
      // If I pause all, it's safe.
      if (e.code === 'Space') {
        e.preventDefault();
        // Pause all playing tracks
        Object.values(trackRefs.current).forEach(ref => {
          if (ref && ref.isPlaying()) ref.pause();
        });
        return;
      }

      // Normalize Numpad keys
      let code = e.code;
      if (code.startsWith('Numpad') && /\d/.test(code)) {
        code = code.replace('Numpad', 'Digit');
      }

      // Volume Control for Selected Item
      if (selectedItemId && (code === 'ArrowUp' || code === 'ArrowDown')) {
        e.preventDefault();
        const item = items.find(i => i.id === selectedItemId);
        if (item && item.type === 'audio') {
          const step = 0.05;
          const delta = code === 'ArrowUp' ? step : -step;
          const newVol = Math.min(1, Math.max(0, item.volume + delta));
          handleUpdateTrack(item.id, { volume: newVol });
        }
        return;
      }

      // volume control for playing items
      if (code === 'Comma' || code === 'Period') {
        const step = 0.05;
        const delta = code === 'Period' ? step : -step;

        // Find all PLAYING audio tracks
        const playingIds: string[] = [];
        Object.entries(trackRefs.current).forEach(([id, ref]) => {
          if (ref && ref.isPlaying()) {
            playingIds.push(id);
          }
        });

        if (playingIds.length > 0) {
          e.preventDefault();
          setItems(prev => prev.map(item => {
            if (playingIds.includes(item.id) && item.type === 'audio') {
              const newVol = Math.min(1, Math.max(0, item.volume + delta));
              return { ...item, volume: newVol };
            }
            return item;
          }));
        }
        return;
      }

      const matchedTrack = items.find(t => t.type === 'audio' && t.assignedKey === code) as TrackData | undefined;
      if (matchedTrack) {
        e.preventDefault();
        const ref = trackRefs.current[matchedTrack.id];
        if (ref) {
          // User requested: "Si oprimo la tecla... se detiene. Yo necesitaría que se reinicie"
          // So if playing, we stop (reset to start) and play again.
          // Actually, 'play' method in AudioCard checks currentTime < startPoint.
          // We should force restart.
          // Let's call stop() then play() or add a restart method?
          // Or just calling play() if we modify AudioCard to restart?
          // Safest is to explicitly stop (reset) then play.

          if (ref.isPlaying()) {
            ref.stop(); // Resets to startPoint
            ref.play();
          } else {
            handlePlayRequest(matchedTrack.id, e.shiftKey);
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [items, handlePlayRequest]);

  // -- DnD Logic --

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // -- Save / Load Session --

  const handleSaveSession = async () => {
    try {
      const path = await save({
        filters: [{
          name: 'LiveLoop Session',
          extensions: ['json']
        }],
        defaultPath: `${sessionName.replace(/\s+/g, '_')}.json`
      });

      if (!path) return;

      const sessionData: SavedSession = {
        version: 2,
        name: sessionName,
        items: items.map(item => {
          return {
            id: item.id,
            type: 'audio',
            name: item.name,
            volume: item.volume,
            startPoint: item.startPoint,
            isLooping: item.isLooping,
            assignedKey: item.assignedKey,
            path: item.path // Persist path
          };
        })
      };

      await writeTextFile(path, JSON.stringify(sessionData, null, 2));
      alert("Session saved successfully!");

    } catch (err) {
      console.error("Failed to save session", err);
      alert("Failed to save session.");
    }
  };

  const handleLoadSession = async () => {
    try {
      const path = await open({
        filters: [{
          name: 'LiveLoop Session',
          extensions: ['json']
        }]
      });

      if (!path) return;
      // path is string or string[] (if multiple)
      const filePath = Array.isArray(path) ? path[0] : path;
      if (!filePath) return;

      const content = await readTextFile(filePath);
      const session = JSON.parse(content) as SavedSession;

      setSessionName(session.name || "Loaded Session");

      if (session.items) {
        // Reconstruct items
        const newItems: StudioItem[] = session.items.map((item: any) => {
          return {
            id: item.id || generateId(),
            type: 'audio',
            name: item.name,
            // Restore fileUrl from path if available
            fileUrl: item.path ? convertFileSrc(item.path) : '',
            path: item.path,
            volume: item.volume ?? 0.8,
            startPoint: item.startPoint ?? 0,
            isLooping: item.isLooping ?? false,
            assignedKey: item.assignedKey ?? null,
            duration: 0 // Will be recalculated on load
          };
        });
        setItems(newItems);
      } else {
        // V1 Fallback (simplified)
        alert("Legacy session format. Some data might be missing.");
      }

    } catch (err) {
      console.error("Failed to load session", err);
      alert("Failed to load session.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-studio-900 text-gray-200 font-sans selection:bg-studio-accent selection:text-studio-900">

      {/* Top Bar */}
      <header className="h-16 border-b border-studio-700 bg-studio-900 flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-studio-accent">
            <Music size={24} className="animate-pulse-slow" />
            <h1 className="text-xl font-bold tracking-tight">LiveLoop Studio</h1>
          </div>
          <div className="h-6 w-px bg-studio-700 mx-2"></div>
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            className="bg-transparent border-none text-gray-400 hover:text-white focus:text-white focus:ring-0 font-medium text-sm w-48 transition-colors"
          />
        </div>

        <div className="flex items-center gap-3">


          <button
            onClick={() => setShowKeyMapHint(!showKeyMapHint)}
            className={`p-2 rounded transition-colors ${showKeyMapHint ? 'bg-studio-accent text-black' : 'text-studio-500 hover:text-gray-200'}`}
            title="Keyboard Shortcuts Info"
          >
            <Keyboard size={20} />
          </button>
          <div className="h-6 w-px bg-studio-700 mx-1"></div>

          <button
            onClick={handleAddFiles}
            className="flex items-center gap-2 bg-studio-700 hover:bg-studio-600 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            <span>Add Tracks</span>
          </button>

          <button
            onClick={handleSaveSession}
            className="flex items-center gap-2 bg-studio-800 border border-studio-600 hover:bg-studio-700 text-gray-200 px-3 py-2 rounded text-sm transition-colors"
          >
            <Save size={16} />
          </button>

          <button
            onClick={handleLoadSession}
            className="flex items-center gap-2 bg-studio-800 border border-studio-600 hover:bg-studio-700 text-gray-200 px-3 py-2 rounded text-sm transition-colors"
          >
            <FolderOpen size={16} />
          </button>
        </div>
      </header>

      {/* Info Banner */}
      {showKeyMapHint && (
        <div className="bg-studio-800 border-b border-studio-700 px-6 py-2 text-xs text-studio-400 flex items-center justify-between animate-in slide-in-from-top-2">
          <div className="flex gap-6">
            <span className="flex items-center gap-1"><span className="bg-studio-700 px-1 rounded text-gray-200">Shift</span> + <PlayCircle size={12} /> : Layer playback (don't stop others)</span>
            <span className="flex items-center gap-1"><span className="bg-studio-700 px-1 rounded text-gray-200">Click Key</span> on card : Assign shortcut</span>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <main className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-studio-600 border-2 border-dashed border-studio-800 rounded-xl">
            <Upload size={48} className="mb-4 opacity-50" />
            <h2 className="text-xl font-medium text-studio-500 mb-2">No tracks loaded</h2>
            <p className="text-sm mb-6">Drag and drop audio files or click "Add Tracks"</p>
            <div className="flex gap-4">
              <button
                onClick={handleAddFiles}
                className="bg-studio-accent text-studio-900 px-6 py-2 rounded font-bold hover:bg-yellow-400 transition-colors"
              >
                Load Audio
              </button>

            </div>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={items.map(i => i.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {items.map(item => (
                  <SortableItem key={item.id} id={item.id}>
                    <AudioCard
                      track={item}
                      ref={(el) => { trackRefs.current[item.id] = el; }}
                      isSelected={selectedItemId === item.id}
                      onSelect={setSelectedItemId}
                      onUpdate={handleUpdateTrack}
                      onRemove={handleRemoveItem}
                      onPlayRequest={handlePlayRequest}
                      isKeyMappingMode={false}
                    />
                  </SortableItem>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </main>

      {/* Footer Status */}
      <footer className="h-8 bg-studio-900 border-t border-studio-800 flex items-center px-4 text-[10px] text-studio-600 justify-between">
        <span>Ready. {items.length} items loaded.</span>
        <span className="flex items-center gap-1"><AlertCircle size={10} /> Local browser session</span>
      </footer>

      {/* DMX Console Modal */}


    </div>
  );
};

export default App;