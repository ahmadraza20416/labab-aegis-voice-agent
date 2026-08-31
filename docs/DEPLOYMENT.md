# 🚀 AegisVoice Deployment & Production Guide

This guide explains how to deploy AegisVoice to cloud environments including Docker, Railway, Render, and Linux VPS instances.

---

## 1. Quick Docker Deployment (Recommended)

### Build the Image
```bash
docker build -t aegis-voice:latest .
```

### Run Container
```bash
docker run -d \
  -p 8000:8000 \
  -e ASSEMBLYAI_API_KEY="your_assemblyai_api_key" \
  -e GROQ_API_KEY="your_groq_api_key" \
  --name aegis-voice-app \
  aegis-voice:latest
```

### Or using Docker Compose:
```bash
docker compose up -d
```

---

## 2. Deploy to Railway / Render

1. Fork or push this repository to your GitHub account.
2. Log in to [Railway](https://railway.app) or [Render](https://render.com).
3. Create a **New Web Service** connected to your repository.
4. Set the Build Command:
   ```bash
   pip install -r requirements.txt
   ```
5. Set the Start Command:
   ```bash
   uvicorn app:app --host 0.0.0.0 --port $PORT
   ```
6. Add your Environment Variables:
   - `ASSEMBLYAI_API_KEY`
   - `GROQ_API_KEY` or `OPENAI_API_KEY`
   - `LLM_PROVIDER=groq`
   - `TTS_PROVIDER=edge`

---

## 3. Deploy to Linux VPS (Ubuntu / Debian)

```bash
# Update & install Python
sudo apt update && sudo apt install -y python3 python3-pip python3-venv git

# Clone repo
git clone https://github.com/your-username/aegis-voice.git
cd "Voice agent"

# Setup virtual environment
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run with systemd or tmux
python3 app.py
```

---

## 4. HTTPS / SSL Requirement for Microphone Access

> [!IMPORTANT]
> Modern web browsers (Chrome, Safari, Firefox) require an **HTTPS** connection or `localhost` to allow microphone access (`navigator.mediaDevices.getUserMedia`).
> When deploying to production with a custom domain, ensure SSL/TLS is enabled (e.g. through Cloudflare, Caddy, or Nginx with Let's Encrypt).
