# 🚨 AegisVoice Pro — Autonomous Emergency Voice Triage & Multi-Agent Dispatch Copilot

> **Submission for the AssemblyAI × lablab.ai Voice AI Hackathon (Path B: Universal-Streaming & Custom Orchestration)**  
> *Sub-second voice intake, Medical Priority Dispatch System (MPDS) clinical triage, multi-agent CAD orchestration, and HL7 FHIR interoperability.*

---

## 🌟 Executive Summary

Emergency call centers (911/999/112) globally face acute dispatcher shortages, long hold queues, and extreme cognitive fatigue. In life-critical emergencies (cardiac arrests, structure fires, severe motor vehicle collisions), **every second shaved off dispatch time directly correlates with human survival rates.**

**AegisVoice Pro** is an autonomous, mission-critical Voice AI Dispatch Copilot built on **AssemblyAI's Universal-Streaming Real-Time Speech-to-Text API**. It handles real-time caller speech with sub-second latency, continuously extracts clinical vitals (Glasgow Coma Scale, AVPU, airway/breathing, hemorrhage), matches exact **MPDS determinant codes** (Echo, Delta, Charlie, Alpha), coordinates a **Multi-Agent Swarm** (Intake, Clinical Triage, CAD Logistics, Clinical Safety Supervisor), executes real-time emergency tool calling, renders live tactical Leaflet GIS vectors, and exports standardized **HL7 FHIR (Release 4) clinical encounter bundles** for hospital trauma teams.

---

## 🏛️ System Architecture (Path B: Universal-Streaming)

```
                       ┌────────────────────────────────────────────────────────┐
                       │          Tactical 911 Dispatch Web Console             │
                       │   (AudioWorklet 16kHz PCM + Leaflet Dark GIS Map)      │
                       └───────────────────▲────────────────┬───────────────────┘
                                           │ Audio Stream   │ PCM16 Chunks
                                           │ & Telemetry    │ (16kHz Mono)
                                           │                ▼
┌──────────────────────────────────────────┴────────────────────────────────────────────────────┐
│                             FastAPI Orchestrator Server Layer                                 │
│                                                                                               │
│  🎙️ Ingestion ────────► AssemblyAI Universal-Streaming Real-Time STT                          │
│                                           │                                                   │
│  🧠 Multi-Agent Swarm ◄───────────────────┴─── Live Partial & Final Transcripts               │
│         │                                                                                     │
│         ├── 1. IntakeAgent (Conversational Caller Rapport & Reassurance)                      │
│         ├── 2. TriageSpecialistAgent (MPDS Codes 09-E-01, GCS & AVPU scoring)                 │
│         ├── 3. LogisticsDispatchAgent (CAD Fleet Resource Allocation)                         │
│         └── 4. ClinicalSupervisorAgent (Safety Guardrails & First-Aid SMS Countermeasures)    │
│                                                                                               │
│  🛠️ JSON-Schema Tool Execution Engine                                                         │
│         ├── dispatch_emergency_units(incident, units, priority, location)                    │
│         ├── lookup_trauma_centers(location, specialty)                                       │
│         ├── record_patient_vitals(consciousness, breathing, bleeding)                        │
│         ├── send_first_aid_sms(protocol_type, summary_message)                               │
│         └── trigger_hazard_containment(hazard_type, radius)                                  │
│                                                                                               │
│  🔊 Voice Synthesis ──► Streaming TTS (Edge-TTS / Cartesia / Deepgram)                       │
│         └── Base64 Audio Chunks with Barge-In Interruption Support                            │
│                                                                                               │
│  🏥 Interoperability ──► HL7 FHIR (R4) Emergency Encounter Bundle Generator                  │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Pro-Tier Key Capabilities

1. **AssemblyAI Universal-Streaming STT Integration**
   * Continuous sub-second speech recognition over WebSockets.
   * Real-time streaming partial transcript feedback on the dispatcher console.
2. **Medical Priority Dispatch System (MPDS) Clinical Engine**
   * Computes standardized MPDS codes (`09-E-01 Echo Arrest`, `10-D-01 Delta Cardiac`, `29-D-01 Delta Crash`, `08-D-01 Delta Hazmat`).
   * Evaluates **AVPU** (Alert, Verbal, Pain, Unresponsive) and **Glasgow Coma Scale (GCS 3-15)**.
3. **Multi-Agent Coordination Swarm**
   * 4 specialized agents operating in parallel to handle intake rapport, clinical analysis, fleet routing, and pre-arrival safety instructions.
4. **Interactive Leaflet Tactical GIS Map**
   * Dynamic geographic sector mapping with live animated responder vehicles and trauma center proximity vectors.
5. **HL7 FHIR (Release 4) Emergency Electronic Health Record**
   * One-click generation of standard FHIR Bundles (`Patient`, `Encounter`, `Observation`) ready for ER trauma hospital intake.
6. **Zero-Latency AudioWorklet Architecture**
   * Background audio thread downsampling and instant **barge-in interruption** (audio cutoff when user speaks).

---

## 🎯 Alignment with Hackathon Judging Criteria

| Judging Criteria | Hackathon Weight | How AegisVoice Pro Maximizes Score |
| :--- | :--- | :--- |
| **Application of Technology** | 25% | Direct integration with AssemblyAI Universal-Streaming WebSocket at 16kHz PCM16, coupled with AudioWorklet downsampling, multi-agent orchestration, and sub-second TTS. |
| **Business Value & Impact** | 25% | Direct enterprise application for 911 centers, hospital emergency departments, private EMS, and military dispatch ops. |
| **Originality & Novelty** | 25% | First Voice AI agent integrating official MPDS clinical determinants, AVPU/GCS scoring, and HL7 FHIR healthcare records. |
| **Presentation & UX** | 25% | High-tech tactical command console, live oscilloscope, interactive Leaflet GIS map, and one-click CAD/FHIR report exports. |

---

## 🛠️ Quickstart Guide

### 1. Prerequisites
- Python 3.10+ installed
- AssemblyAI API Key ([Get one here](https://www.assemblyai.com/dashboard))
- Groq API Key ([Get one here](https://console.groq.com/)) or OpenAI API Key

### 2. Installation
```bash
git clone https://github.com/your-username/aegis-voice.git
cd "Voice agent"
pip install -r requirements.txt
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and insert your API keys:
```env
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here
GROQ_API_KEY=your_groq_api_key_here
LLM_PROVIDER=groq
TTS_PROVIDER=edge
```

### 4. Run the Server
```bash
python app.py
```
Open your browser at: `http://localhost:8000`

---

## 🧪 Test Suite
Run the full verification suite:
```bash
python test_pipeline.py
```

---

## 👥 Hackathon Submission Deliverables
- **Submission Form Guide:** [`docs/HACKATHON_SUBMISSION.md`](docs/HACKATHON_SUBMISSION.md)
- **Slide Presentation Deck:** [`docs/PITCH_DECK.md`](docs/PITCH_DECK.md)
- **Video Demo Script:** [`docs/VIDEO_DEMO_SCRIPT.md`](docs/VIDEO_DEMO_SCRIPT.md)
- **Architecture Deep-Dive:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **API Reference:** [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)
- **Production Deployment:** [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---
*License: MIT Open Source*
