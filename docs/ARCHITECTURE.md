# 🏗️ AegisVoice Technical Architecture & System Design

> Deep-dive architectural documentation for the AegisVoice Voice AI Dispatch Platform.

---

## 1. Architectural Philosophy (Path B: Universal-Streaming)

AegisVoice implements an asynchronous, low-latency streaming pipeline that treats audio, transcription, reasoning, tool execution, and telemetry as concurrent streams rather than blocking request-response stages.

```
 [Browser Client]
   │  ▲ (Web Audio 16kHz PCM Stream / WebSocket)
   ▼  │
 [FastAPI ASGI Hub (app.py)]
   │
   ├── 🎙️ AssemblyAI Real-Time STT Worker (core/stt.py)
   │        • WebSocket: wss://api.assemblyai.com/v2/realtime/ws
   │        • 16kHz 16-bit Mono Linear PCM stream
   │        • Sub-second PartialTranscript & FinalTranscript emits
   │
   ├── ⚙️ Central Orchestrator & State Machine (core/orchestrator.py)
   │        • Turn-taking coordinator
   │        • CAD Incident electronic health record
   │        • Telemetry broadcasting to command consoles
   │
   ├── 🧠 LLM Reasoning & Function Calling Engine (core/llm.py)
   │        • Groq Llama-3.3-70B (TTFT < 200ms) or OpenAI GPT-4o-mini
   │        • Parallel JSON-Schema tool invocations
   │
   ├── 🛠️ Emergency Tool Execution Engine (core/tools.py)
   │        • dispatch_emergency_units()
   │        • record_patient_vitals()
   │        • lookup_trauma_centers()
   │        • send_first_aid_sms()
   │        • trigger_hazard_containment()
   │
   └── 🔊 High-Speed Streaming Audio Synthesizer (core/tts.py)
            • Asynchronous text-to-speech stream chunking
            • Base64 streaming audio reply delivery
```

---

## 2. Low-Latency Pipeline Flow & Benchmarks

| Hop | Step | Mechanism | Target Latency |
| :--- | :--- | :--- | :--- |
| **1** | Audio Ingestion | Web Audio API -> AudioWorklet -> WebSocket | `< 20ms` |
| **2** | Streaming STT | AssemblyAI Universal-Streaming WebSocket | `Sub-second` |
| **3** | Reasoning & Tool Calling | Groq Llama-3.3-70B API | `~ 150 - 300ms` |
| **4** | Tool Execution | Async in-memory incident mutator & telemetry | `< 10ms` |
| **5** | Voice Synthesis (TTS) | Streaming Edge-TTS / Cartesia chunking | `~ 150 - 250ms` |
| **6** | Client Audio Playback | HTML5 Audio Buffer Stream | `< 30ms` |
| **Total** | **End-to-End Voice Turnaround** | **Full conversational turnaround** | **`< 900ms`** |

---

## 3. Data Models & Triage State Machine

### Clinical Triage Severity Levels
```
  ┌─────────────────────────────────────────────────────────────┐
  │                       INCOMING CALL                         │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      [Critical Life Threat?]           [Urgent / Severe Trauma?]
        • Cardiac Arrest                  • Fractures / Moderate bleed
        • Unconscious victim              • Vehicle accident (stable)
        • Uncontrolled bleed              • Hazard alert
                 │                               │
                 ▼                               ▼
       【 P1 - RED (Critical) 】        【 P2 - AMBER (Urgent) 】
       • Ambulance + ALS + Fire         • Ambulance
       • ETA: 2-4 min                   • ETA: 5-8 min
       • Push CPR SMS guide             • Alert local trauma clinic
                                                 │
                                                 ▼
                                        【 P3 - GREEN (Standard) 】
                                        • Minor cuts / inquiries
                                        • Routine transfer
```

---

## 4. Resilience & Fallback Design

1. **Graceful Degradation:** If network fluctuations occur on the STT WebSocket, the client automatically handles reconnection with exponential backoff.
2. **Dual-Model LLM Routing:** Defaults to ultra-fast Groq Llama 3.3 for maximum speed, with seamless automated fallback to OpenAI GPT-4o-mini and an internal deterministic rule engine for offline resilience.
3. **Audio Resampling:** Browser-side Web Audio converts any arbitrary mic hardware sample rate (44.1kHz / 48kHz) to standardized 16kHz PCM16 required by AssemblyAI.
