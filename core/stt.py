import asyncio
import json
import logging
from typing import Callable, Awaitable, Optional
import websockets
from core.config import settings

logger = logging.getLogger("AegisVoice.STT")

class AssemblyAIStreamingSTT:
    """
    Manages real-time low-latency speech-to-text connection with AssemblyAI Universal-Streaming.
    Handles raw 16kHz mono PCM stream forwarding, partial transcripts, and final turns.
    """

    def __init__(
        self,
        on_partial_transcript: Optional[Callable[[str], Awaitable[None]]] = None,
        on_final_transcript: Optional[Callable[[str], Awaitable[None]]] = None,
        on_error: Optional[Callable[[str], Awaitable[None]]] = None
    ):
        self.api_key = settings.ASSEMBLYAI_API_KEY
        self.sample_rate = 16000
        self.ws_url = f"wss://api.assemblyai.com/v2/realtime/ws?sample_rate={self.sample_rate}"
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self.is_connected = False
        self.on_partial_transcript = on_partial_transcript
        self.on_final_transcript = on_final_transcript
        self.on_error = on_error
        self._receive_task: Optional[asyncio.Task] = None

    async def connect(self) -> bool:
        if not self.api_key or self.api_key.startswith("your_"):
            logger.warning("[AssemblyAI STT] No valid API Key configured. Running in Fallback/Simulator Mode.")
            self.is_connected = False
            return False

        try:
            extra_headers = {"Authorization": self.api_key}
            self.ws = await websockets.connect(self.ws_url, extra_headers=extra_headers)
            self.is_connected = True
            self._receive_task = asyncio.create_task(self._listen_loop())
            logger.info("[AssemblyAI STT] Successfully connected to Universal-Streaming WebSocket.")
            return True
        except Exception as e:
            logger.error(f"[AssemblyAI STT] Connection error: {e}")
            self.is_connected = False
            if self.on_error:
                await self.on_error(str(e))
            return False

    async def _listen_loop(self):
        try:
            async for message in self.ws:
                data = json.loads(message)
                msg_type = data.get("message_type")

                if msg_type == "SessionBegins":
                    session_id = data.get("session_id")
                    logger.info(f"[AssemblyAI STT] Session started: {session_id}")

                elif msg_type == "PartialTranscript":
                    text = data.get("text", "").strip()
                    if text and self.on_partial_transcript:
                        await self.on_partial_transcript(text)

                elif msg_type == "FinalTranscript":
                    text = data.get("text", "").strip()
                    if text and self.on_final_transcript:
                        await self.on_final_transcript(text)

                elif "error" in data:
                    err_msg = data.get("error")
                    logger.error(f"[AssemblyAI STT] Server error: {err_msg}")
                    if self.on_error:
                        await self.on_error(err_msg)

        except websockets.exceptions.ConnectionClosed:
            logger.info("[AssemblyAI STT] WebSocket connection closed.")
        except Exception as e:
            logger.error(f"[AssemblyAI STT] Listener loop error: {e}")
            if self.on_error:
                await self.on_error(str(e))
        finally:
            self.is_connected = False

    async def send_audio_chunk(self, audio_data: bytes):
        """Sends raw PCM16 audio chunk directly to AssemblyAI."""
        if self.is_connected and self.ws:
            try:
                # AssemblyAI accepts raw binary audio frames or base64 JSON
                await self.ws.send(audio_data)
            except Exception as e:
                logger.error(f"[AssemblyAI STT] Error sending audio chunk: {e}")

    async def close(self):
        """Terminates session cleanly."""
        self.is_connected = False
        if self._receive_task and not self._receive_task.done():
            self._receive_task.cancel()
        if self.ws:
            try:
                # Terminate message to AssemblyAI
                await self.ws.send(json.dumps({"terminate_session": True}))
                await self.ws.close()
            except Exception:
                pass
