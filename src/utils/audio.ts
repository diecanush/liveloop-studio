
export const getAudioContext = () => {
    // Reuse the same context to avoid browser limits (usually max 6 contexts)
    // and reduce overhead.
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!window._sharedAudioContext) {
        window._sharedAudioContext = new AudioContextClass();
    }
    return window._sharedAudioContext;
};

// Add type definition for the global property
declare global {
    interface Window {
        _sharedAudioContext: AudioContext;
    }
}

// Concurrency limiter for decodeAudioData
const decodeQueue: { arrayBuffer: ArrayBuffer; resolve: (buffer: AudioBuffer) => void; reject: (err: any) => void }[] = [];
let activeDecodes = 0;
const MAX_CONCURRENT_DECODES = 2; // Keep it low to avoid blocking UI

const processQueue = async () => {
    if (activeDecodes >= MAX_CONCURRENT_DECODES || decodeQueue.length === 0) return;

    const task = decodeQueue.shift();
    if (!task) return;

    activeDecodes++;
    const ctx = getAudioContext();

    try {
        // decodeAudioData is CPU intensive.
        const audioBuffer = await ctx.decodeAudioData(task.arrayBuffer);
        task.resolve(audioBuffer);
    } catch (err) {
        task.reject(err);
    } finally {
        activeDecodes--;
        processQueue();
    }
};

export const decodeAudioDataSafely = (arrayBuffer: ArrayBuffer): Promise<AudioBuffer> => {
    return new Promise((resolve, reject) => {
        decodeQueue.push({ arrayBuffer, resolve, reject });
        processQueue();
    });
};
