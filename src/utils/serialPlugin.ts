import { invoke } from "@tauri-apps/api/core";

export interface SerialportOptions {
    path: string;
    baudRate: number;
    dataBits?: "Five" | "Six" | "Seven" | "Eight";
    flowControl?: "None" | "Software" | "Hardware";
    parity?: "None" | "Odd" | "Even";
    stopBits?: "One" | "Two";
    timeout?: number;
}

export class SerialPort {
    options: SerialportOptions;

    constructor(options: SerialportOptions) {
        this.options = {
            dataBits: "Eight",
            flowControl: "None",
            parity: "None",
            stopBits: "One",
            timeout: 200,
            ...options
        };
    }

    static async available_ports(): Promise<{ [key: string]: any }> {
        return await invoke('plugin:serialplugin|available_ports');
    }

    async open(): Promise<void> {
        return await invoke('plugin:serialplugin|open', {
            path: this.options.path,
            baudRate: this.options.baudRate,
            dataBits: this.options.dataBits,
            flowControl: this.options.flowControl,
            parity: this.options.parity,
            stopBits: this.options.stopBits,
            timeout: this.options.timeout,
        });
    }

    async close(): Promise<void> {
        return await invoke('plugin:serialplugin|close', {
            path: this.options.path,
        });
    }

    async setBreak(): Promise<void> {
        return await invoke('plugin:serialplugin|set_break', {
            path: this.options.path
        });
    }

    async clearBreak(): Promise<void> {
        return await invoke('plugin:serialplugin|clear_break', {
            path: this.options.path
        });
    }

    async writeBinary(value: Uint8Array | number[]): Promise<number> {
        return await invoke('plugin:serialplugin|write_binary', {
            value: Array.from(value),
            path: this.options.path,
        });
    }
}
