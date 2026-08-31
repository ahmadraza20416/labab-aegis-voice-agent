/**
 * AegisVoice Pro - Advanced Dual-Mode Audio Visualizer & Real-time VU Meter
 * Modes: 'bars' (Multi-band Neon Frequency Equalizer) & 'oscilloscope' (Glowing Audio Waveform)
 */
class AudioVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.analyser = null;
        this.dataArray = null;
        this.timeDomainArray = null;
        this.animationId = null;
        this.isActive = false;
        this.mode = 'bars'; // 'bars' | 'oscilloscope'
        this.vuMeterCallback = null;
        this.peakLevels = [];

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width || 340;
        this.canvas.height = rect.height || 110;
    }

    setMode(mode) {
        this.mode = mode;
        const toggleBtn = document.getElementById('btn-visualizer-mode');
        if (toggleBtn) {
            toggleBtn.innerHTML = mode === 'bars' 
                ? '<i data-lucide="activity" class="w-3.5 h-3.5"></i> <span class="hidden sm:inline">Equalizer</span>'
                : '<i data-lucide="git-commit" class="w-3.5 h-3.5"></i> <span class="hidden sm:inline">Oscilloscope</span>';
            if (window.lucide) lucide.createIcons();
        }
    }

    onVUMeterUpdate(callback) {
        this.vuMeterCallback = callback;
    }

    attach(audioContext, sourceNode) {
        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.smoothingTimeConstant = 0.82;
        sourceNode.connect(this.analyser);

        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
        this.timeDomainArray = new Uint8Array(this.analyser.fftSize);
        this.peakLevels = new Array(bufferLength).fill(0);
        
        this.isActive = true;
        this.draw();
    }

    draw() {
        if (!this.isActive || !this.ctx) return;

        this.animationId = requestAnimationFrame(() => this.draw());
        this.analyser.getByteFrequencyData(this.dataArray);
        this.analyser.getByteTimeDomainData(this.timeDomainArray);

        const width = this.canvas.width;
        const height = this.canvas.height;

        // Dark Tactical Canvas background with faint grid
        this.ctx.fillStyle = '#070a11';
        this.ctx.fillRect(0, 0, width, height);

        // Draw HUD grid lines
        this.ctx.strokeStyle = 'rgba(38, 57, 92, 0.35)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        // Horizontal center
        this.ctx.moveTo(0, height / 2);
        this.ctx.lineTo(width, height / 2);
        // Vertical quarters
        this.ctx.moveTo(width * 0.25, 0);
        this.ctx.lineTo(width * 0.25, height);
        this.ctx.moveTo(width * 0.5, 0);
        this.ctx.lineTo(width * 0.5, height);
        this.ctx.moveTo(width * 0.75, 0);
        this.ctx.lineTo(width * 0.75, height);
        this.ctx.stroke();

        // Calculate Average Volume / VU level
        let total = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            total += this.dataArray[i];
        }
        const avgVolume = total / this.dataArray.length;
        const volumePercent = Math.min(100, Math.round((avgVolume / 140) * 100));

        if (this.vuMeterCallback) {
            this.vuMeterCallback(volumePercent);
        }

        if (this.mode === 'oscilloscope') {
            this._drawOscilloscope(width, height);
        } else {
            this._drawEqualizerBars(width, height);
        }
    }

    _drawEqualizerBars(width, height) {
        const numBars = 36;
        const step = Math.floor(this.dataArray.length / numBars);
        const barWidth = Math.max(3, (width / numBars) - 2.5);
        let x = 3;

        for (let i = 0; i < numBars; i++) {
            const val = this.dataArray[i * step] || 0;
            const barHeight = Math.max(3, (val / 255) * (height - 12));

            // Peak cap decay
            if (barHeight > this.peakLevels[i]) {
                this.peakLevels[i] = barHeight;
            } else {
                this.peakLevels[i] = Math.max(3, this.peakLevels[i] - 0.8);
            }

            // Neon Gradient from Cyan -> Blue -> Amber -> Red
            const gradient = this.ctx.createLinearGradient(0, height, 0, 0);
            gradient.addColorStop(0, '#06b6d4');
            gradient.addColorStop(0.5, '#3b82f6');
            gradient.addColorStop(0.85, '#f59e0b');
            gradient.addColorStop(1, '#ef4444');

            this.ctx.fillStyle = gradient;
            this.ctx.shadowBlur = val > 120 ? 8 : 0;
            this.ctx.shadowColor = '#06b6d4';

            // Draw rounded bar
            const radius = Math.min(2, barWidth / 2);
            const barY = height - barHeight - 4;
            this.ctx.beginPath();
            this.ctx.roundRect(x, barY, barWidth, barHeight, [radius, radius, 0, 0]);
            this.ctx.fill();

            // Draw floating peak indicator
            this.ctx.fillStyle = '#67e8f9';
            this.ctx.fillRect(x, height - this.peakLevels[i] - 6, barWidth, 2);

            x += barWidth + 2.5;
        }
        this.ctx.shadowBlur = 0;
    }

    _drawOscilloscope(width, height) {
        this.ctx.lineWidth = 2.5;
        this.ctx.strokeStyle = '#06b6d4';
        this.ctx.shadowBlur = 12;
        this.ctx.shadowColor = '#06b6d4';
        this.ctx.beginPath();

        const sliceWidth = width / this.timeDomainArray.length;
        let x = 0;

        for (let i = 0; i < this.timeDomainArray.length; i++) {
            const v = this.timeDomainArray[i] / 128.0;
            const y = (v * height) / 2;

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }

        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    stop() {
        this.isActive = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.ctx && this.canvas) {
            this.ctx.fillStyle = '#070a11';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.vuMeterCallback) {
            this.vuMeterCallback(0);
        }
    }
}
