import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { Play, Pause, Square, Repeat, Volume2, VolumeX, Trash2 } from 'lucide-react';
import type { TrackData, AudioCardHandle } from '../types';
import { decodeAudioDataSafely } from '../utils/audio';
import { readFile } from '@tauri-apps/plugin-fs';

interface AudioCardProps {
  track: TrackData;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<TrackData>) => void;
  onRemove: (id: string) => void;
  onPlayRequest: (id: string, shiftKey: boolean) => void;
  isKeyMappingMode: boolean;
  sceneColor?: string | null;
  sceneName?: string | null;
}

const VolumeControl = ({ volume, onChange }: { volume: number, onChange: (vol: number) => void }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lastVolume, setLastVolume] = useState(1);

  // Native non-passive wheel listener to prevent scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const step = 0.05;
      const delta = e.deltaY > 0 ? -step : step;
      const newVol = Math.min(1, Math.max(0, volume + delta));
      onChange(newVol);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [volume, onChange]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (volume > 0) {
      setLastVolume(volume);
      onChange(0);
    } else {
      onChange(lastVolume || 0.8);
    }
  };

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-2 flex-1 group/vol bg-studio-900/50 p-1.5 rounded border border-transparent hover:border-studio-600 transition-colors min-w-[100px]"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={toggleMute}
        className={`focus:outline-none transition-colors shrink-0 ${volume === 0 ? 'text-studio-600' : 'text-studio-500 group-hover/vol:text-studio-accent'}`}
        title={volume === 0 ? "Unmute" : "Mute"}
      >
        {volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>

      <div className="relative w-full flex items-center">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            onChange(isNaN(val) ? 0 : val);
          }}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none"
          style={{
            background: `linear-gradient(to right, #ffb300 ${volume * 100}%, #3d3d3d ${volume * 100}%)`
          }}
        />
      </div>
    </div>
  );
};
const AudioCard = forwardRef<AudioCardHandle, AudioCardProps>(({ track, isSelected, onSelect, onUpdate, onRemove, onPlayRequest, sceneColor, sceneName }, ref) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration || 0);
  const [waitingForKey, setWaitingForKey] = useState(false);
  const [waveformGenerated, setWaveformGenerated] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    play: () => {
      if (audioRef.current) {
        if (audioRef.current.currentTime < track.startPoint) {
          audioRef.current.currentTime = track.startPoint;
        }
        audioRef.current.play().catch(e => console.error("Playback failed", e));
      }
    },
    pause: () => {
      audioRef.current?.pause();
    },
    stop: () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = track.startPoint;
        setIsPlaying(false);
      }
    },
    isPlaying: () => isPlaying
  }));

  // --- Load Audio File as Blob ---
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    const loadAudio = async () => {
      try {
        // Prefer 'path' (absolute path) for persistence, fallback to 'fileUrl' if it's already a blob/asset url
        // But since asset protocol is broken, we rely heavily on 'path'.
        const path = track.path;

        if (!path) {
          console.warn("No path available for track:", track.name);
          // Fallback: if we have a fileUrl that IS NOT an asset url (e.g. from previous session?), try it.
          // But mostly we need 'path'.
          if (track.fileUrl) setAudioSrc(track.fileUrl);
          return;
        }

        console.log(`Loading audio from path: ${path}`);
        const fileContents = await readFile(path);
        const blob = new Blob([fileContents], { type: 'audio/mpeg' }); // Adjust type if needed, or detect
        objectUrl = URL.createObjectURL(blob);

        if (active) {
          setAudioSrc(objectUrl);
        }
      } catch (err) {
        console.error("Error loading audio file:", err);
      }
    };

    loadAudio();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [track.path, track.fileUrl, track.name]);


  // --- Waveform Generation Logic ---
  useEffect(() => {
    if (!audioSrc || waveformGenerated) return;

    const generateWaveform = async () => {
      try {
        console.log(`Generating waveform for ${track.name}`);
        const response = await fetch(audioSrc);
        if (!response.ok) {
          throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await decodeAudioDataSafely(arrayBuffer);

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Canvas dimensions
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.offsetWidth;
        const height = canvas.offsetHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        const rawData = audioBuffer.getChannelData(0);
        const samples = width; // One bar per pixel roughly
        const blockSize = Math.floor(rawData.length / samples);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#525252'; // studio-600 (Unplayed color)

        for (let i = 0; i < samples; i++) {
          const start = i * blockSize;
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(rawData[start + j]);
          }
          const avg = sum / blockSize;

          // Draw symmetric wave
          const barHeight = Math.max(2, avg * height * 1.5); // 1.5 multiplier for better visibility
          const y = (height - barHeight) / 2;

          // Draw rounded bar
          ctx.beginPath();
          ctx.roundRect(i, y, 2, barHeight, 1);
          ctx.fill();
        }

        setWaveformGenerated(true);
        // Also update duration if not set
        if (!track.duration) {
          onUpdate(track.id, { duration: audioBuffer.duration });
          setDuration(audioBuffer.duration);
        }

      } catch (err) {
        console.error("Error generating waveform for", track.name, err);
      }
    };

    generateWaveform();
  }, [audioSrc, track.id, onUpdate, waveformGenerated, track.duration, track.name]);

  // --- Audio Event Listeners ---
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(audio.currentTime);
      }
    };

    const handleLoadedMetadata = () => {
      if (!duration && audio.duration) {
        setDuration(audio.duration);
        onUpdate(track.id, { duration: audio.duration });
      }
    };
    const handleEnded = () => {
      if (track.isLooping) {
        audio.currentTime = track.startPoint;
        audio.play().catch(console.error);
      } else {
        setIsPlaying(false);
        audio.currentTime = track.startPoint;
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleError = (e: any) => console.error("Audio Element Error:", e);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('error', handleError);
    };
  }, [track.id, track.isLooping, track.startPoint, onUpdate, duration, isScrubbing]);

  // Sync Volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = track.volume;
    }
  }, [track.volume]);

  // Sync Loop
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = false; // We handle loop manually to respect Start Point
    }
  }, [track.isLooping]);

  // Handle Play Click
  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      onPlayRequest(track.id, e.shiftKey);
    }
  };

  const handleStopClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = track.startPoint;
    }
  };

  // --- Scrubbing Logic ---
  const handleScrub = useCallback((clientX: number) => {
    if (progressRef.current && duration) {
      const rect = progressRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const p = Math.max(0, Math.min(1, x / rect.width));
      const newTime = p * duration;

      if (audioRef.current) {
        audioRef.current.currentTime = newTime;
      }
      setCurrentTime(newTime);
    }
  }, [duration]);

  const startScrub = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsScrubbing(true);
    handleScrub(e.clientX);
  };

  useEffect(() => {
    if (isScrubbing) {
      const onMove = (e: MouseEvent) => handleScrub(e.clientX);
      const onUp = () => setIsScrubbing(false);

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);

      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }
  }, [isScrubbing, handleScrub]);



  // Set Start Point
  const handleSetStartPoint = (e: React.MouseEvent) => {
    e.stopPropagation(); // Stop click propagation
    // Note: We also handle onMouseDown on the button to prevent scrubbing start
    const newStart = currentTime;
    onUpdate(track.id, { startPoint: newStart });
  };

  // Key Mapping
  useEffect(() => {
    if (waitingForKey) {
      const handleKeyDown = (e: KeyboardEvent) => {
        e.preventDefault();
        // Normalize Numpad keys to Digit keys
        let code = e.code;
        if (code.startsWith('Numpad') && /\d/.test(code)) {
          code = code.replace('Numpad', 'Digit');
        }
        onUpdate(track.id, { assignedKey: code });
        setWaitingForKey(false);
      };
      window.addEventListener('keydown', handleKeyDown, { once: true });
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [waitingForKey, track.id, onUpdate]);

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const ms = Math.floor((time % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const displayKey = (key: string | null) => {
    if (!key) return 'KEY';
    return key.replace('Key', '').replace('Digit', '').replace('Numpad', '');
  };

  return (
    <div
      onClick={() => onSelect(track.id)}
      className={`relative group bg-studio-800 border rounded-md p-3 transition-all duration-200 shadow-lg cursor-pointer ${isSelected
        ? 'border-studio-accent ring-2 ring-studio-accent/50 bg-studio-800/80'
        : isPlaying
          ? 'border-studio-accent ring-1 ring-studio-accent/20'
          : 'border-studio-700 hover:border-studio-500'
        }`}
    >
      <audio ref={audioRef} src={audioSrc || undefined} preload="auto" />

      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="truncate pr-2 w-full">
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center gap-2 min-w-0">
              {sceneColor && (
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0 shadow ring-1 ring-black/30"
                  style={{ backgroundColor: sceneColor }}
                  title={sceneName || 'Linked scene'}
                ></div>
              )}
              <h3 className="text-sm font-medium text-gray-200 truncate pr-2" title={track.name}>{track.name}</h3>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(track.id); }}
              className="text-studio-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {/* Key Badge - Enlarged */}
            <button
              onClick={(e) => { e.stopPropagation(); setWaitingForKey(true); }}
              className={`text-xs font-bold px-3 py-1 rounded border transition-colors min-w-[40px] text-center ${waitingForKey ? 'bg-studio-accent text-black border-studio-accent animate-pulse' :
                track.assignedKey ? 'bg-studio-700 text-studio-accent border-studio-600 hover:bg-studio-600' :
                  'bg-studio-900 text-gray-500 border-studio-700 hover:text-gray-300'
                }`}
            >
              {waitingForKey ? 'PRESS' : displayKey(track.assignedKey)}
            </button>
            <span className="text-xs font-mono text-studio-500">
              {formatTime(currentTime)}
            </span>
          </div>
        </div>
      </div>

      {/* Main Waveform / Progress Area */}
      <div
        ref={progressRef}
        className="relative h-16 bg-studio-900 rounded border border-studio-700 mb-3 overflow-hidden group/progress cursor-pointer"
        onMouseDown={startScrub}
      >
        {/* Waveform Canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full z-0 opacity-80 pointer-events-none"
        />

        {/* Start Point Marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 pointer-events-none"
          style={{ left: `${(track.startPoint / (duration || 1)) * 100}%` }}
        />

        {/* Progress Fill (Overlay) */}
        <div
          className={`absolute top-0 bottom-0 left-0 transition-all duration-75 z-10 mix-blend-overlay pointer-events-none ${isPlaying ? 'bg-studio-accent/60' : 'bg-white/10'}`}
          style={{ width: `${(currentTime / (duration || 1)) * 100}%`, borderRight: '1px solid rgba(255,255,255,0.5)' }}
        />

        {/* Set Cue Button */}
        <button
          onClick={handleSetStartPoint}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute top-1 right-1 bg-studio-800/90 text-blue-400 p-1 rounded text-[10px] font-bold opacity-0 group-hover/progress:opacity-100 transition-opacity z-40 hover:bg-white hover:text-black shadow-sm backdrop-blur-sm"
          title="Set Start Point Here"
        >
          SET CUE
        </button>
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between gap-2">

        {/* Transport */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handlePlayClick}
            className={`w-8 h-8 rounded transition-colors flex items-center justify-center ${isPlaying
              ? 'bg-studio-success text-black'
              : 'bg-studio-700 text-gray-300 hover:bg-studio-600 hover:text-white'
              }`}
          >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
          </button>

          <button
            onClick={handleStopClick}
            className="w-8 h-8 flex items-center justify-center rounded bg-studio-800 border border-studio-700 text-studio-500 hover:text-red-400 hover:border-red-400/30 transition-colors"
          >
            <Square size={14} fill="currentColor" />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); onUpdate(track.id, { isLooping: !track.isLooping }); }}
            className={`w-8 h-8 flex items-center justify-center rounded border transition-colors ${track.isLooping
              ? 'bg-studio-800 border-blue-500/50 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
              : 'bg-studio-800 border-studio-700 text-studio-600 hover:text-studio-400'
              }`}
            title="Loop Mode"
          >
            <Repeat size={14} />
          </button>
        </div>

        {/* Volume */}
        <VolumeControl
          volume={track.volume}
          onChange={(vol) => onUpdate(track.id, { volume: vol })}
        />

      </div>
    </div>
  );
});

AudioCard.displayName = 'AudioCard';

export default AudioCard;
