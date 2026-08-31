import asyncio
import base64
import json
import logging
import uuid
import time
from typing import Set, Dict, Any, List, Optional
from fastapi import WebSocket

from core.models import EmergencyIncident, TriageLevel
from core.stt import AssemblyAIStreamingSTT
from core.llm import LLMReasoningEngine
from core.tts import StreamingTTS

logger = logging.getLogger("AegisVoice.Orchestrator")

class VoicePipelineOrchestrator:
    """
    Coordinates the real-time audio pipeline:
    Mic Audio Stream -> AssemblyAI STT -> LLM with Tool Calling -> TTS Synthesis -> Audio Speaker Output + Telemetry.
    """

    def __init__(self):
        self.incident = EmergencyIncident(incident_id=f"INC-{uuid.uuid4().hex[:6].upper()}")
        self.conversation_history: List[Dict[str, str]] = []
        self.telemetry_subscribers: Set[WebSocket] = set()
        self.caller_ws: Optional[WebSocket] = None

        self.llm_engine = LLMReasoningEngine()
        self.tts_engine = StreamingTTS()
        self.stt_client: Optional[AssemblyAIStreamingSTT] = None
        self._processing_turn = False

    async def register_telemetry(self, ws: WebSocket):
        self.telemetry_subscribers.add(ws)
        # Send initial snapshot of the incident
        await self.broadcast_telemetry({
            "type": "incident_snapshot",
            "incident": self.incident.model_dump()
        })

    def unregister_telemetry(self, ws: WebSocket):
        self.telemetry_subscribers.discard(ws)

    async def broadcast_telemetry(self, message: Dict[str, Any]):
        """Broadcasts real-time events to all connected dispatch command center screens."""
        dead_sockets = set()
        for ws in self.telemetry_subscribers:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                dead_sockets.add(ws)
        
        for ws in dead_sockets:
            self.telemetry_subscribers.discard(ws)

    async def start_caller_session(self, ws: WebSocket):
        """Initializes a new live emergency call session."""
        self.caller_ws = ws
        self.incident = EmergencyIncident(incident_id=f"INC-{uuid.uuid4().hex[:6].upper()}")
        self.conversation_history = []

        # Initialize AssemblyAI STT
        self.stt_client = AssemblyAIStreamingSTT(
            on_partial_transcript=self._handle_partial_transcript,
            on_final_transcript=self._handle_final_transcript,
            on_error=self._handle_stt_error
        )
        await self.stt_client.connect()

        # Send initial greeting
        greeting_text = "911 Emergency Dispatch. What is the exact location of your emergency?"
        self.conversation_history.append({"role": "assistant", "content": greeting_text})
        self.incident.call_transcript.append({"speaker": "Agent", "text": greeting_text, "timestamp": time.strftime("%H:%M:%S")})

        # Broadcast initial state
        await self.broadcast_telemetry({
            "type": "incident_snapshot",
            "incident": self.incident.model_dump()
        })

        # Synthesize and send initial audio greeting
        audio_bytes = await self.tts_engine.synthesize(greeting_text)
        if audio_bytes and self.caller_ws:
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
            await self.caller_ws.send_text(json.dumps({
                "type": "audio_reply",
                "audio": audio_b64,
                "text": greeting_text
            }))

    async def process_incoming_audio(self, audio_chunk: bytes):
        """Streams audio chunk to AssemblyAI real-time STT."""
        if self.stt_client and self.stt_client.is_connected:
            await self.stt_client.send_audio_chunk(audio_chunk)

    async def _handle_partial_transcript(self, text: str):
        """Handles live partial transcription streaming."""
        await self.broadcast_telemetry({
            "type": "partial_transcript",
            "speaker": "Caller",
            "text": text
        })
        if self.caller_ws:
            await self.caller_ws.send_text(json.dumps({
                "type": "partial_transcript",
                "text": text
            }))

    async def _handle_final_transcript(self, text: str):
        """Processes completed utterance from caller."""
        if not text or self._processing_turn:
            return

        self._processing_turn = True
        try:
            timestamp = time.strftime("%H:%M:%S")
            self.conversation_history.append({"role": "user", "content": text})
            self.incident.call_transcript.append({"speaker": "Caller", "text": text, "timestamp": timestamp})

            # Broadcast user turn to UI
            await self.broadcast_telemetry({
                "type": "final_transcript",
                "speaker": "Caller",
                "text": text,
                "timestamp": timestamp
            })

            # Signal thinking status
            if self.caller_ws:
                await self.caller_ws.send_text(json.dumps({"type": "agent_thinking"}))

            # 1. Execute MultiAgent Clinical & Dispatch Assessment
            from core.agents import MultiAgentSwarm
            swarm_res = await MultiAgentSwarm.process_turn(text, self.conversation_history, self.incident)

            # 2. Run LLM reasoning + tool execution
            reply_text, executed_tools = await self.llm_engine.generate_response(
                self.conversation_history,
                self.incident
            )

            # Merge any tools executed by the clinical swarm
            all_tools = executed_tools + swarm_res.get("tools_executed", [])

            # Record agent speech
            self.conversation_history.append({"role": "assistant", "content": reply_text})
            self.incident.call_transcript.append({"speaker": "Agent", "text": reply_text, "timestamp": time.strftime("%H:%M:%S")})

            # Broadcast updated telemetry to Command Center
            await self.broadcast_telemetry({
                "type": "incident_update",
                "incident": self.incident.model_dump(),
                "new_tools": all_tools
            })

            # Synthesize voice output
            audio_bytes = await self.tts_engine.synthesize(reply_text)
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8") if audio_bytes else ""

            # Dispatch back to caller
            if self.caller_ws:
                await self.caller_ws.send_text(json.dumps({
                    "type": "audio_reply",
                    "audio": audio_b64,
                    "text": reply_text
                }))

            await self.broadcast_telemetry({
                "type": "final_transcript",
                "speaker": "Agent",
                "text": reply_text,
                "timestamp": time.strftime("%H:%M:%S")
            })

            # Persist to SQLite WAL Database
            from core.database import DatabaseManager
            DatabaseManager.save_incident(self.incident)
            DatabaseManager.log_transcript_utterance(self.incident.incident_id, "Caller", text)
            DatabaseManager.log_transcript_utterance(self.incident.incident_id, "Agent", reply_text)

        finally:
            self._processing_turn = False

    async def handle_text_prompt(self, text: str):
        """Allows testing the pipeline via text inputs (simulated speech)."""
        await self._handle_final_transcript(text)

    async def _handle_stt_error(self, err_msg: str):
        logger.error(f"[Orchestrator STT Error] {err_msg}")
        await self.broadcast_telemetry({
            "type": "system_error",
            "source": "AssemblyAI STT",
            "message": err_msg
        })

    async def close_session(self):
        if self.stt_client:
            await self.stt_client.close()
        self.caller_ws = None
        logger.info("[Orchestrator] Caller session terminated.")
