import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file if present
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    # AssemblyAI
    ASSEMBLYAI_API_KEY: str = os.getenv("ASSEMBLYAI_API_KEY", "")
    
    # LLM Settings
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "groq" if os.getenv("GROQ_API_KEY") else "openai").lower()
    LLM_MODEL: str = os.getenv("LLM_MODEL", "openai/gpt-oss-120b" if LLM_PROVIDER == "groq" else "gpt-4o-mini")
    
    # TTS Settings
    TTS_PROVIDER: str = os.getenv("TTS_PROVIDER", "edge").lower()
    TTS_VOICE: str = os.getenv("TTS_VOICE", "en-US-GuyNeural")  # Calm, authoritative voice
    
    # Server Settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8080"))
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    
    # Simulation / Fallback Mode (allows full UI testing even if keys are absent)
    ALLOW_MOCK_FALLBACK: bool = True

settings = Settings()
