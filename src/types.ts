export interface TrackData {
  id: string;
  type: 'audio';
  name: string;
  fileUrl: string; // Blob URL
  volume: number; // 0 to 1
  startPoint: number; // Seconds
  isLooping: boolean;
  assignedKey: string | null;
  duration: number; // Duration in seconds (populated after load)
  path?: string; // Absolute path for persistence
}


export type StudioItem = TrackData;

export interface DMXScene {
  id: string;
  name: string;
  color: string;
  levels: number[]; // Up to 512 channels
  linkedItemId?: string | null;
}

export interface AudioCardHandle {
  play: () => void;
  pause: () => void;
  stop: () => void;
  isPlaying: () => boolean;
}

export interface SavedSessionTrack {
  id: string;
  type?: 'audio'; // Optional for backward compatibility
  name: string;
  volume: number;
  startPoint: number;
  isLooping: boolean;
  assignedKey: string | null;
  path?: string;
}

export interface SavedSession {
  version: number;
  name: string;
  items: SavedSessionTrack[];
  dmxLevels?: number[];
  scenes?: DMXScene[];
  selectedInterface?: string;
  activeSceneId?: string | null;
  // Deprecated but kept for migration if needed, though we'll prefer 'items'
  tracks?: SavedSessionTrack[];
}


export interface DmxPortInfo {
  path: string;
  kind?: string;
  manufacturer?: string;
  product?: string;
  serial_number?: string;
}

