# 🔌 AegisVoice API Reference & Protocol Specification

This document details the REST endpoints and WebSocket protocols exposed by the AegisVoice server.

---

## 1. REST Endpoints

### `GET /`
- **Description:** Serves the Command Center 911 Dispatch Web Dashboard.
- **Response:** `text/html`

### `GET /api/health`
- **Description:** System health check and configured AI providers.
- **Response:**
  ```json
  {
    "status": "healthy",
    "service": "AegisVoice Copilot",
    "assemblyai_configured": true,
    "groq_configured": true,
    "openai_configured": false,
    "tts_provider": "edge",
    "llm_provider": "groq"
  }
  ```

### `GET /api/incident`
- **Description:** Returns the active CAD emergency incident object.
- **Response:**
  ```json
  {
    "incident_id": "INC-A1B2C3",
    "created_at": 1756450000.0,
    "caller_phone": "Live Voice Stream",
    "location": "420 Market Street",
    "incident_type": "Critical Trauma / Cardiac Emergency",
    "triage_level": "RED",
    "vitals": {
      "consciousness": "Unresponsive / Unconscious",
      "breathing": "Not Breathing / Arrest",
      "bleeding": "None",
      "triage_level": "RED"
    },
    "dispatched_units": [
      {
        "unit_id": "AMB-04",
        "unit_type": "AMBULANCE",
        "station": "Station #04 Metro Central",
        "status": "EN_ROUTE",
        "eta_minutes": 3
      }
    ],
    "tool_logs": [],
    "call_transcript": [],
    "notes": [],
    "resolved": false
  }
  ```

### `POST /api/reset`
- **Description:** Resets the active incident session and initializes a clean CAD ticket.
- **Response:**
  ```json
  {
    "status": "reset",
    "incident_id": "INC-D4E5F6"
  }
  ```

---

## 2. WebSocket Channels

### `WS /ws/caller` (Caller Voice Stream)
- **Protocol:** Two-way binary/JSON stream.
- **Client -> Server Frames:**
  - **Binary:** Raw 16kHz 16-bit Mono Linear PCM audio chunks.
  - **JSON:** `{"type": "text_prompt", "text": "Caller utterance string"}`
- **Server -> Client Frames:**
  - **Partial Transcript:** `{"type": "partial_transcript", "text": "..."}`
  - **Thinking Status:** `{"type": "agent_thinking"}`
  - **Audio Reply:** `{"type": "audio_reply", "audio": "<base64_mp3>", "text": "Spoken text"}`

---

### `WS /ws/telemetry` (Command Center Live Sync)
- **Protocol:** Server-sent real-time telemetry stream.
- **Events Emitted:**
  - `incident_snapshot`: Initial state on connection.
  - `incident_update`: Fired when vitals, triage level, location, or units change.
  - `partial_transcript`: Fired as the caller speaks in real-time.
  - `final_transcript`: Fired when a conversational turn completes.
  - `tool_executed`: Fired whenever an emergency tool is invoked.
  - `system_error`: Fired on connectivity warnings.

---

## 3. Emergency JSON-Schema Tools

| Function | Parameters | Action |
| :--- | :--- | :--- |
| `dispatch_emergency_units` | `incident_type`, `units`, `priority`, `location`, `eta_minutes`, `dispatch_notes` | Deploys responder units and tracks ETAs. |
| `lookup_trauma_centers` | `location`, `specialty_required` | Finds available regional ICU/trauma facilities. |
| `record_patient_vitals` | `consciousness`, `breathing`, `bleeding`, `symptoms`, `triage_level` | Updates clinical electronic triage matrix. |
| `send_first_aid_sms` | `instruction_type`, `summary_message` | Transmits emergency first-aid protocols via SMS. |
| `trigger_hazard_containment` | `hazard_type`, `evacuation_radius_meters`, `containment_instructions` | Broadcasts hazardous perimeter evacuation alerts. |
