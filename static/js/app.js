/**
 * AegisVoice Pro - Advanced Voice Engine & CAD Dispatch Client
 * Features: Background AudioWorklet Downsampler, Barge-in Interruption, Call Duration Stopwatch,
 * CPR Metronome Engine, Sound FX cues, Audio Output Volume, VU Meter.
 */

class AegisVoiceApp {
    constructor() {
        this.callerSocket = null;
        this.audioContext = null;
        this.micStream = null;
        this.workletNode = null;
        this.currentAudioElement = null;
        this.visualizer = new AudioVisualizer('waveform-canvas');
        this.isPlayingAudio = false;
        this.isCalling = false;
        this.isMuted = false;
        this.turnStartTime = 0;
        this.outputVolume = 1.0;
        
        // Call Stopwatch State
        this.callStartTime = null;
        this.stopwatchInterval = null;

        // CPR Metronome State (110 BPM target)
        this.cprActive = false;
        this.cprInterval = null;
        this.cprBpm = 110;
        this.cprAudioCtx = null;

        this._initUI();
        this._checkHealth();
    }

    async _checkHealth() {
        try {
            const res = await fetch('/api/health');
            const data = await res.json();
            
            const badge = document.getElementById('badge-llm');
            if (badge) {
                badge.innerText = data.llm_provider === 'groq' ? 'Groq Llama-3.3-70B' : 'OpenAI GPT-4o-mini';
            }
            const sttBadge = document.getElementById('badge-stt');
            if (sttBadge) {
                sttBadge.innerText = data.assemblyai_configured ? 'Universal-Streaming' : 'Web Speech / Fallback';
            }
            const ttsBadge = document.getElementById('badge-tts');
            if (ttsBadge) {
                ttsBadge.innerText = data.tts_provider ? data.tts_provider.toUpperCase() : 'EDGE-TTS';
            }

            // Update Modal & Button Status Indicators
            const sttModalBadge = document.getElementById('badge-status-assemblyai');
            if (sttModalBadge) {
                if (data.assemblyai_configured) {
                    sttModalBadge.className = 'px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                    sttModalBadge.innerText = 'CONNECTED';
                } else {
                    sttModalBadge.className = 'px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse';
                    sttModalBadge.innerText = 'KEY REQUIRED';
                }
            }

            const llmModalBadge = document.getElementById('badge-status-llm');
            const llmModalLabel = document.getElementById('label-status-llm');
            const isLlmConfigured = data.groq_configured || data.openai_configured;
            if (llmModalBadge) {
                if (isLlmConfigured) {
                    llmModalBadge.className = 'px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
                    llmModalBadge.innerText = 'ACTIVE';
                } else {
                    llmModalBadge.className = 'px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse';
                    llmModalBadge.innerText = 'KEY REQUIRED';
                }
            }
            if (llmModalLabel) {
                llmModalLabel.innerText = data.llm_provider === 'groq' ? 'Groq Reasoning Engine' : 'OpenAI Reasoning Engine';
            }

            const headerDot = document.getElementById('api-status-dot');
            const alertBox = document.getElementById('box-api-alert');
            const alertMsg = document.getElementById('msg-api-alert');
            const allReady = data.assemblyai_configured && isLlmConfigured;

            if (headerDot) {
                headerDot.className = allReady ? 'w-2 h-2 rounded-full bg-emerald-400' : 'w-2 h-2 rounded-full bg-red-400 animate-ping';
            }

            if (!allReady) {
                if (alertBox) alertBox.classList.remove('hidden');
                let missingList = [];
                if (!data.assemblyai_configured) missingList.push('ASSEMBLYAI_API_KEY');
                if (!isLlmConfigured) missingList.push('GROQ_API_KEY or OPENAI_API_KEY');
                if (alertMsg) alertMsg.innerHTML = `Missing: <strong>${missingList.join(', ')}</strong> in your <code>.env</code> file. The app is currently running in fallback simulation mode.`;
                
                // Show modal automatically if keys are missing
                const modal = document.getElementById('modal-api-status');
                if (modal) modal.classList.remove('hidden');
            }

        } catch (e) {
            console.warn('Health check warning:', e);
        }
    }

    _initUI() {
        const btnCall = document.getElementById('btn-call-toggle');
        const btnMute = document.getElementById('btn-mute-toggle');
        const btnSend = document.getElementById('btn-send-text');
        const textInput = document.getElementById('input-text-prompt');
        const btnApiStatus = document.getElementById('btn-api-status');
        const btnCloseApiStatus = document.getElementById('btn-close-api-status');
        const modalApiStatus = document.getElementById('modal-api-status');

        if (btnApiStatus && modalApiStatus) {
            btnApiStatus.addEventListener('click', () => {
                this._checkHealth();
                modalApiStatus.classList.remove('hidden');
            });
        }
        if (btnCloseApiStatus && modalApiStatus) {
            btnCloseApiStatus.addEventListener('click', () => {
                modalApiStatus.classList.add('hidden');
            });
        }

        // Initialize Pro Theme System (Light Theme as default)
        this._initThemeManager();

        const btnVizMode = document.getElementById('btn-visualizer-mode');
        const volumeSlider = document.getElementById('volume-slider');
        const btnCprToggle = document.getElementById('btn-cpr-toggle');

        if (btnCall) btnCall.addEventListener('click', () => this.toggleCall());
        if (btnMute) btnMute.addEventListener('click', () => this.toggleMute());

        if (btnVizMode) {
            btnVizMode.addEventListener('click', () => {
                const nextMode = this.visualizer.mode === 'bars' ? 'oscilloscope' : 'bars';
                this.visualizer.setMode(nextMode);
            });
        }

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                this.outputVolume = parseFloat(e.target.value);
                if (this.currentAudioElement) {
                    this.currentAudioElement.volume = this.outputVolume;
                }
                const volLabel = document.getElementById('volume-label');
                if (volLabel) volLabel.innerText = `${Math.round(this.outputVolume * 100)}%`;
            });
        }

        if (btnCprToggle) {
            btnCprToggle.addEventListener('click', () => this.toggleCprMetronome());
        }

        // VU meter callback to update UI bar
        this.visualizer.onVUMeterUpdate((percent) => {
            const vuBar = document.getElementById('vu-meter-fill');
            const vuText = document.getElementById('vu-meter-text');
            if (vuBar) {
                vuBar.style.width = `${percent}%`;
                if (percent > 80) {
                    vuBar.className = 'h-full bg-red-500 rounded transition-all duration-75';
                } else if (percent > 45) {
                    vuBar.className = 'h-full bg-amber-400 rounded transition-all duration-75';
                } else {
                    vuBar.className = 'h-full bg-cyan-400 rounded transition-all duration-75';
                }
            }
            if (vuText) {
                vuText.innerText = `${percent}% VU`;
            }
        });

        // Quick Canned Dispatch Prompts
        document.querySelectorAll('.btn-canned-prompt').forEach(btn => {
            btn.addEventListener('click', () => {
                const prompt = btn.getAttribute('data-prompt');
                if (prompt) {
                    this.sendTextPrompt(prompt);
                }
            });
        });

        if (btnSend && textInput) {
            btnSend.addEventListener('click', () => {
                const val = textInput.value.trim();
                if (val) {
                    this.sendTextPrompt(val);
                    textInput.value = '';
                }
            });

            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const val = textInput.value.trim();
                    if (val) {
                        this.sendTextPrompt(val);
                        textInput.value = '';
                    }
                }
            });
        }

        // Keyboard Shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Alt+C : Start/End Call
            if (e.code === 'KeyC' && e.altKey) {
                e.preventDefault();
                this.toggleCall();
            }
            // M : Mute
            else if (e.code === 'KeyM' && !e.ctrlKey && !e.altKey && this.isCalling) {
                e.preventDefault();
                this.toggleMute();
            }
            // P : CPR Metronome
            else if (e.code === 'KeyP' && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                this.toggleCprMetronome();
            }
            // Escape : Close modals
            else if (e.key === 'Escape') {
                const modalExport = document.getElementById('modal-export');
                const modalHelp = document.getElementById('modal-shortcuts');
                if (modalExport) modalExport.classList.add('hidden');
                if (modalHelp) modalHelp.classList.add('hidden');
            }
        });

        // Shortcuts Help Button
        const btnHelp = document.getElementById('btn-help-shortcuts');
        const modalHelp = document.getElementById('modal-shortcuts');
        const closeHelp = document.getElementById('btn-close-shortcuts');
        if (btnHelp && modalHelp) {
            btnHelp.addEventListener('click', () => modalHelp.classList.remove('hidden'));
        }
        if (closeHelp && modalHelp) {
            closeHelp.addEventListener('click', () => modalHelp.classList.add('hidden'));
        }
    }

    _playCueSound(freq = 600, duration = 0.08, type = 'sine') {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {
            // Audio context permission might not be allowed yet
        }
    }

    _startStopwatch() {
        this.callStartTime = Date.now();
        const stopwatchElem = document.getElementById('header-stopwatch');
        const stopwatchBadge = document.getElementById('call-duration-badge');

        if (this.stopwatchInterval) clearInterval(this.stopwatchInterval);

        this.stopwatchInterval = setInterval(() => {
            if (!this.callStartTime) return;
            const elapsedSeconds = Math.floor((Date.now() - this.callStartTime) / 1000);
            const mins = String(Math.floor(elapsedSeconds / 60)).padStart(2, '0');
            const secs = String(elapsedSeconds % 60).padStart(2, '0');
            const timeStr = `${mins}:${secs}`;
            if (stopwatchElem) stopwatchElem.innerText = timeStr;
            if (stopwatchBadge) stopwatchBadge.innerText = timeStr;
        }, 1000);
    }

    _stopStopwatch() {
        if (this.stopwatchInterval) {
            clearInterval(this.stopwatchInterval);
            this.stopwatchInterval = null;
        }
        const stopwatchElem = document.getElementById('header-stopwatch');
        const stopwatchBadge = document.getElementById('call-duration-badge');
        if (stopwatchElem) stopwatchElem.innerText = '00:00';
        if (stopwatchBadge) stopwatchBadge.innerText = '00:00';
    }

    toggleCprMetronome(forceState = null) {
        this.cprActive = forceState !== null ? forceState : !this.cprActive;
        const cprCard = document.getElementById('cpr-metronome-card');
        const cprBtn = document.getElementById('btn-cpr-toggle');
        const cprPulse = document.getElementById('cpr-heart-pulse');
        const cprStatus = document.getElementById('cpr-status-text');

        if (this.cprActive) {
            if (cprCard) cprCard.classList.remove('hidden');
            if (cprBtn) {
                cprBtn.className = 'px-2 py-1 text-xs font-semibold rounded bg-red-600 hover:bg-red-500 text-white flex items-center gap-1 shadow-lg shadow-red-950/50';
                cprBtn.innerHTML = '<i data-lucide="heart-pulse" class="w-3.5 h-3.5 animate-spin"></i> CPR ACTIVE';
            }
            if (cprPulse) cprPulse.classList.add('cpr-beat');
            if (cprStatus) cprStatus.innerText = 'PACE: 110 BPM (Target: 100-120 BPM)';

            const intervalMs = (60 / this.cprBpm) * 1000;
            if (this.cprInterval) clearInterval(this.cprInterval);
            this.cprInterval = setInterval(() => {
                this._playCueSound(880, 0.05, 'triangle');
            }, intervalMs);

        } else {
            if (cprBtn) {
                cprBtn.className = 'px-2 py-1 text-xs font-medium rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1';
                cprBtn.innerHTML = '<i data-lucide="heart" class="w-3.5 h-3.5"></i> CPR Metronome';
            }
            if (cprPulse) cprPulse.classList.remove('cpr-beat');
            if (cprStatus) cprStatus.innerText = 'STANDBY';
            if (this.cprInterval) {
                clearInterval(this.cprInterval);
                this.cprInterval = null;
            }
        }
        if (window.lucide) lucide.createIcons();
    }

    async toggleCall() {
        if (this.isCalling) {
            this.endCall();
        } else {
            await this.startCall();
        }
    }

    async startCall() {
        this.setCallStatus('CONNECTING...', 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse');
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/caller`;

        try {
            this.callerSocket = new WebSocket(wsUrl);

            this.callerSocket.onopen = async () => {
                this.isCalling = true;
                this._playCueSound(800, 0.1);
                this._startStopwatch();
                this.updateCallUI(true);
                this.setCallStatus('LISTENING', 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40');
                
                const micHint = document.getElementById('mic-hint-overlay');
                if (micHint) micHint.classList.add('hidden');

                // Start AudioWorklet Capture
                await this.startAudioCapture();
            };

            this.callerSocket.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleCallerMessage(data);
                } catch (e) {
                    console.error('[Caller WS] Error parsing message:', e);
                }
            };

            this.callerSocket.onclose = () => {
                this.endCall();
            };

            this.callerSocket.onerror = (err) => {
                console.error('[Caller WS] Error:', err);
                this.endCall();
            };

        } catch (err) {
            console.error('Call initialization failed:', err);
            this.setCallStatus('CALL FAILED', 'bg-red-500/20 text-red-400 border-red-500/40');
            this.endCall();
        }
    }

    async startAudioCapture() {
        try {
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.micStream);

            // Connect to visualizer
            this.visualizer.attach(this.audioContext, source);

            // Load AudioWorklet for zero-latency background downsampling
            try {
                await this.audioContext.audioWorklet.addModule('/static/js/pcm-worker.js');
                this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm16-downsampler');

                this.workletNode.port.onmessage = (event) => {
                    if (!this.isCalling || this.isMuted) return;

                    const pcmBuffer = event.data;
                    if (this.callerSocket && this.callerSocket.readyState === WebSocket.OPEN) {
                        this.callerSocket.send(pcmBuffer);
                    }
                };

                source.connect(this.workletNode);
                this.workletNode.connect(this.audioContext.destination);

            } catch (workletError) {
                console.warn('AudioWorklet fallback to ScriptProcessor:', workletError);
                this._fallbackScriptProcessor(source);
            }

        } catch (e) {
            console.warn('Microphone access denied or unavailable. Voice simulation mode active.', e);
        }
    }

    _fallbackScriptProcessor(source) {
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
            if (!this.isCalling || this.isMuted) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const pcm16 = this.floatTo16BitPCM(inputData);
            if (this.callerSocket && this.callerSocket.readyState === WebSocket.OPEN) {
                this.callerSocket.send(pcm16.buffer);
            }
        };
        source.connect(processor);
        processor.connect(this.audioContext.destination);
    }

    floatTo16BitPCM(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        let offset = 0;
        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        return new Uint8Array(buffer);
    }

    handleCallerMessage(data) {
        if (data.type === 'audio_reply') {
            this.setCallStatus('DISPATCHER SPEAKING', 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 animate-pulse font-bold');
            if (this.turnStartTime > 0) {
                const latency = Date.now() - this.turnStartTime;
                const hud = document.getElementById('hud-latency');
                if (hud) hud.innerText = `~${latency}ms TTFT`;
            }
            if (data.audio) {
                this.playAudioBase64(data.audio);
            }
        } else if (data.type === 'agent_thinking') {
            this.setCallStatus('CLINICAL TRIAGE...', 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse');
        }
    }

    async playAudioBase64(b64Audio) {
        try {
            // Barge-in: interrupt previous speech if playing
            if (this.currentAudioElement) {
                this.currentAudioElement.pause();
                this.currentAudioElement = null;
            }

            this.isPlayingAudio = true;
            const audioSrc = `data:audio/mp3;base64,${b64Audio}`;
            this.currentAudioElement = new Audio(audioSrc);
            this.currentAudioElement.volume = this.outputVolume;
            
            this.currentAudioElement.onended = () => {
                this.isPlayingAudio = false;
                this.currentAudioElement = null;
                this.setCallStatus('LISTENING', 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40');
            };

            await this.currentAudioElement.play();
        } catch (e) {
            this.isPlayingAudio = false;
            this.setCallStatus('LISTENING', 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40');
        }
    }

    sendTextPrompt(text) {
        this.turnStartTime = Date.now();
        if (this.callerSocket && this.callerSocket.readyState === WebSocket.OPEN) {
            this.callerSocket.send(JSON.stringify({
                type: 'text_prompt',
                text: text
            }));
        } else {
            this.startCall().then(() => {
                setTimeout(() => {
                    if (this.callerSocket && this.callerSocket.readyState === WebSocket.OPEN) {
                        this.callerSocket.send(JSON.stringify({
                            type: 'text_prompt',
                            text: text
                        }));
                    }
                }, 500);
            });
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        const btnMute = document.getElementById('btn-mute-toggle');
        if (this.isMuted) {
            btnMute.className = 'px-3 py-2.5 rounded-lg bg-red-600 text-white border border-red-500 shadow-md shadow-red-950/60';
            btnMute.innerHTML = '<i data-lucide="mic-off" class="w-4 h-4"></i>';
        } else {
            btnMute.className = 'px-3 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700';
            btnMute.innerHTML = '<i data-lucide="mic" class="w-4 h-4 text-cyan-400"></i>';
        }
        if (window.lucide) lucide.createIcons();
    }

    endCall() {
        this.isCalling = false;
        this.isPlayingAudio = false;
        this._stopStopwatch();
        this._playCueSound(400, 0.12, 'sawtooth');

        if (this.currentAudioElement) {
            this.currentAudioElement.pause();
            this.currentAudioElement = null;
        }

        this.updateCallUI(false);
        this.setCallStatus('IDLE', 'bg-slate-800 text-slate-400 border-slate-700');
        
        const micHint = document.getElementById('mic-hint-overlay');
        if (micHint) micHint.classList.remove('hidden');

        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }

        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.visualizer.stop();

        if (this.callerSocket) {
            this.callerSocket.close();
            this.callerSocket = null;
        }
    }

    updateCallUI(active) {
        const btn = document.getElementById('btn-call-toggle');
        const btnMute = document.getElementById('btn-mute-toggle');

        if (active) {
            btn.className = 'flex-1 py-2.5 px-3 rounded-lg font-bold text-xs bg-slate-800 hover:bg-slate-700 text-red-400 border border-red-500/40 shadow-lg shadow-red-950/40 flex items-center justify-center gap-2 transition-all transform active:scale-95';
            btn.innerHTML = '<i data-lucide="phone-off" class="w-4 h-4 text-red-400"></i> <span>TERMINATE CALL</span>';
            if (btnMute) btnMute.disabled = false;
        } else {
            btn.className = 'flex-1 py-2.5 px-3 rounded-lg font-bold text-xs bg-gradient-to-r from-red-600 via-red-500 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-xl shadow-red-950/80 flex items-center justify-center gap-2 transition-all transform active:scale-95 border border-red-400/30';
            btn.innerHTML = '<i data-lucide="phone-call" class="w-4 h-4 animate-bounce"></i> <span>INITIATE 911 CALL</span>';
            if (btnMute) btnMute.disabled = true;
        }
        if (window.lucide) lucide.createIcons();
    }

    _initThemeManager() {
        const btnToggle = document.getElementById('btn-theme-toggle');
        const storedTheme = localStorage.getItem('aegis_theme') || 'light';
        this.setTheme(storedTheme);

        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
                const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
                this.setTheme(nextTheme);
            });
        }
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('aegis_theme', theme);

        const iconElem = document.getElementById('icon-theme');
        const labelElem = document.getElementById('label-theme');

        if (theme === 'light') {
            if (iconElem) {
                iconElem.setAttribute('data-lucide', 'sun');
                iconElem.className = 'w-3.5 h-3.5 text-amber-500';
            }
            if (labelElem) labelElem.innerText = 'LIGHT';
            if (window.telemetryManager && window.telemetryManager.map) {
                const tilePane = document.querySelector('.leaflet-tile-pane');
                if (tilePane) tilePane.style.filter = 'none';
            }
        } else {
            if (iconElem) {
                iconElem.setAttribute('data-lucide', 'moon');
                iconElem.className = 'w-3.5 h-3.5 text-cyan-400';
            }
            if (labelElem) labelElem.innerText = 'DARK';
            if (window.telemetryManager && window.telemetryManager.map) {
                const tilePane = document.querySelector('.leaflet-tile-pane');
                if (tilePane) tilePane.style.filter = 'brightness(0.65) invert(1) contrast(3) hue-rotate(200deg) saturate(0.25) brightness(0.75)';
            }
        }
        if (window.lucide) lucide.createIcons();
    }

    setCallStatus(text, badgeClass) {
        const badge = document.getElementById('call-status-badge');
        if (badge) {
            badge.innerText = text;
            badge.className = `px-2 py-0.5 text-[11px] font-mono rounded ${badgeClass}`;
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.aegisApp = new AegisVoiceApp();
});
