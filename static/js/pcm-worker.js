/**
 * High-performance AudioWorkletProcessor for 16kHz PCM16 Downsampling
 * Runs off the main UI thread for zero-latency, zero-glitch audio capture.
 */

class PCM16DownsamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.targetSampleRate = 16000;
        this.inputBuffer = [];
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const inputChannelData = input[0];
        const sourceSampleRate = sampleRate; // Global in AudioWorkletGlobalScope

        // Simple and efficient linear downsampling to 16kHz
        const ratio = sourceSampleRate / this.targetSampleRate;
        const newLength = Math.floor(inputChannelData.length / ratio);
        const pcm16Data = new Int16Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const index = Math.floor(i * ratio);
            let s = Math.max(-1, Math.min(1, inputChannelData[index]));
            pcm16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send Int16 buffer directly to the main thread
        this.port.postMessage(pcm16Data.buffer, [pcm16Data.buffer]);

        return true;
    }
}

registerProcessor('pcm16-downsampler', PCM16DownsamplerProcessor);
