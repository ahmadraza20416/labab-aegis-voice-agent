import os
import json
import logging
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.orchestrator import VoicePipelineOrchestrator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("AegisVoice.App")

app = FastAPI(
    title="AegisVoice - Emergency Voice Triage & Dispatch Copilot",
    version="1.0.0",
    description="Real-Time Voice AI Agent for Emergency Call Triage & Rapid Dispatch powered by AssemblyAI Universal-Streaming"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = VoicePipelineOrchestrator()

# Mount static files
BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)
(STATIC_DIR / "css").mkdir(exist_ok=True)
(STATIC_DIR / "js").mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

from core.database import DatabaseManager

# Initialize SQLite database on startup
DatabaseManager.init_db()

@app.get("/")
async def get_index():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return JSONResponse({"status": "AegisVoice API Running. index.html loading..."})

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "AegisVoice Copilot",
        "assemblyai_configured": bool(settings.ASSEMBLYAI_API_KEY and not settings.ASSEMBLYAI_API_KEY.startswith("your_")),
        "groq_configured": bool(settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("your_")),
        "openai_configured": bool(settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("your_")),
        "tts_provider": settings.TTS_PROVIDER,
        "llm_provider": settings.LLM_PROVIDER,
        "database": "SQLite (WAL Mode Enabled)"
    }

@app.get("/api/incident")
async def get_incident():
    return orchestrator.incident.model_dump()

@app.get("/api/incidents")
async def list_incidents(limit: int = 20, offset: int = 0):
    """Returns paginated incidents history with sub-5ms query performance."""
    return {
        "count": limit,
        "offset": offset,
        "incidents": DatabaseManager.list_recent_incidents(limit, offset)
    }

@app.get("/api/incident/fhir")
async def get_incident_fhir():
    from core.fhir import FHIRBundleExporter
    return FHIRBundleExporter.generate_bundle(orchestrator.incident)

@app.post("/api/reset")
async def reset_incident():
    await orchestrator.close_session()
    orchestrator.incident = orchestrator.incident.__class__(incident_id=f"INC-{os.urandom(3).hex().upper()}")
    orchestrator.conversation_history = []
    await orchestrator.broadcast_telemetry({
        "type": "incident_snapshot",
        "incident": orchestrator.incident.model_dump()
    })
    return {"status": "reset", "incident_id": orchestrator.incident.incident_id}

@app.websocket("/ws/caller")
async def caller_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for the caller voice stream.
    Accepts raw 16kHz PCM audio bytes or JSON control frames.
    Sends back audio reply base64 chunks and transcripts.
    """
    await websocket.accept()
    logger.info("[WebSocket] Caller connected.")
    await orchestrator.start_caller_session(websocket)

    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"]:
                # Binary audio chunk from microphone
                await orchestrator.process_incoming_audio(message["bytes"])
            elif "text" in message and message["text"]:
                data = json.loads(message["text"])
                msg_type = data.get("type")
                if msg_type == "text_prompt":
                    # Simulated speech input
                    await orchestrator.handle_text_prompt(data.get("text", ""))
                elif msg_type == "audio_chunk":
                    # Base64 audio chunk
                    raw_bytes = base64.b64decode(data.get("data", ""))
                    await orchestrator.process_incoming_audio(raw_bytes)
    except WebSocketDisconnect:
        logger.info("[WebSocket] Caller disconnected.")
    except Exception as e:
        logger.error(f"[WebSocket Caller Error] {e}")
    finally:
        await orchestrator.close_session()

@app.websocket("/ws/telemetry")
async def telemetry_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for the Command Center 911 Dispatch Dashboard.
    Provides live real-time sync of triage scores, dispatched units, transcripts, and tool logs.
    """
    await websocket.accept()
    logger.info("[WebSocket] Telemetry client connected.")
    await orchestrator.register_telemetry(websocket)

    try:
        while True:
            # Keep-alive ping/pong
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("[WebSocket] Telemetry client disconnected.")
    except Exception as e:
        logger.error(f"[WebSocket Telemetry Error] {e}")
    finally:
        orchestrator.unregister_telemetry(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
