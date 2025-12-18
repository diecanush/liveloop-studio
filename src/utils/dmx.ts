import { invoke } from '@tauri-apps/api/core';
import type { DmxPortInfo } from '../types';

export async function listDmxPorts(): Promise<DmxPortInfo[]> {
  return invoke('dmx_list_ports');
}

export async function sendDmxLevels(portPath: string, levels: number[]): Promise<void> {
  return invoke('dmx_set_levels', { port_path: portPath, levels });
}
