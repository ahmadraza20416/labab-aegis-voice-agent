# 🎥 AegisVoice — Video Demo Presentation Script & Storyboard

> A 3-minute video presentation script with timestamps, visual actions, and voiceover text for the hackathon submission video.

---

## 🎬 Video Overview
- **Target Duration:** 2:30 - 3:00 minutes
- **Format:** Screen capture with facecam / voiceover
- **Primary Focus:** Low-latency voice interaction, AssemblyAI streaming transcription, live tool execution, and the Command Center UI.

---

## ⏱️ Video Storyboard & Script

### `[0:00 - 0:30]` The Problem & Introduction
- **Visual:** Title slide and rapid transition to the AegisVoice Tactical Command Center dashboard (`http://localhost:8000`).
- **Voiceover:**
  > *"Hi everyone! This is our submission for the AssemblyAI Hackathon: AegisVoice — an autonomous emergency voice triage and rapid dispatch copilot.*
  > 
  > *Emergency call centers worldwide suffer from extreme operator shortages. Callers in life-or-death situations are often put on hold. AegisVoice eliminates call wait times by autonomously triaging emergency calls, executing backend dispatch actions in real-time, and guiding callers with live medical protocols."*

---

### `[0:30 - 1:00]` Technical Architecture Walkthrough
- **Visual:** Pan across the top badges and architecture flow: AssemblyAI Universal-Streaming, Groq Reasoning Engine, Streaming TTS, and dual WebSockets.
- **Voiceover:**
  > *"We selected Path B: Universal-Streaming. Our backend streams raw 16-kilohertz PCM audio over WebSockets directly to AssemblyAI's real-time speech-to-text API for sub-second transcriptions.*
  > 
  > *These live transcripts are fed into our asynchronous tool-calling orchestrator, which extracts critical incident entities, updates the triage matrix, executes emergency tools, and streams back calm, authoritative voice instructions with under 900 milliseconds total latency."*

---

### `[1:00 - 2:00]` Live Interactive Demonstration
- **Visual:** Click **"START 911 CALL"**. The waveform visualizer animates with live mic input.
- **Action / Spoken Prompt:**
  > Caller speaks into mic:  
  > *"Help! My father just collapsed at 420 Market Street, he is completely unconscious and not breathing!"*
- **Visual Highlights to Show on Screen:**
  1. AssemblyAI partial transcript streaming live in the center feed.
  2. Triage Severity Matrix instantly flashes **P1 - CRITICAL RED**.
  3. Patient vitals update: *Consciousness: Unresponsive*, *Breathing: Arrest*.
  4. Tool Execution terminal triggers `dispatch_emergency_units()` and `send_first_aid_sms()`.
  5. Active Dispatched Fleet updates with **AMBULANCE-04** and **ALS_PARAMEDIC-02** with live ETAs.
  6. AegisVoice responds over audio with calm CPR compression instructions.

---

### `[2:00 - 2:35]` Multi-Tool Capabilities & Report Export
- **Visual:** Click on the **"Export Report"** button in the header.
- **Voiceover:**
  > *"Notice how the agent didn't just talk—it dispatched units, looked up nearest trauma centers, and sent step-by-step CPR instructions to the caller's mobile device.*
  > 
  > *With one click, dispatchers can view and export the complete formal CAD Incident Case File in Markdown or JSON, complete with verified clinical vitals, unit dispatch timestamps, and audio logs."*

---

### `[2:35 - 3:00]` Conclusion & Impact
- **Visual:** Project summary slide / GitHub repo.
- **Voiceover:**
  > *"AegisVoice turns voice AI into a life-saving infrastructure layer. By combining AssemblyAI's cutting-edge Universal-Streaming STT with low-latency tool calling, we can ensure no emergency call goes unanswered. Thank you!"*
