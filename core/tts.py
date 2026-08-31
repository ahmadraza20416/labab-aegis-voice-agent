import io
import logging
import edge_tts
from core.config import settings

logger = logging.getLogger("AegisVoice.TTS")

class StreamingTTS:
    """
    Synthesizes conversational speech using high-performance streaming TTS.
    Default uses Edge-TTS (high quality, low latency, free).
    """

    def __init__(self, voice: str = None):
        self.voice = voice or settings.TTS_VOICE or "en-US-GuyNeural"

    async def synthesize(self, text: str) -> bytes:
        """
        Converts text to audio bytes (MP3 audio stream).
        """
        clean_text = text.strip()
        if not clean_text:
            return b""

        try:
            communicate = edge_tts.Communicate(clean_text, self.voice, rate="+5%", pitch="+0Hz")
            audio_buffer = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_buffer.write(chunk["data"])
            
            return audio_buffer.getvalue()
        except Exception as e:
            logger.error(f"[TTS] Error generating speech: {e}")
            return b""
