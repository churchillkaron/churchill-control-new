FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AVANTIQO_VOICE_STT_FOUNDATION_MODEL=openai/whisper-large-v3-turbo \
    PORT=80

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt
COPY app.py ./app.py

RUN AVANTIQO_VOICE_REALTIME_RELAY_SECRET=build-only-placeholder-secret-not-for-runtime python - <<'PY'
import torch
import transformers
import fastapi
import uvicorn
import app

assert torch.version.cuda, "AVANTIQO_VOICE_REALTIME_CUDA_ENABLED_TORCH_REQUIRED"
assert app.FOUNDATION_MODEL == "openai/whisper-large-v3-turbo"
assert app.REALTIME_CONTRACT == "AVANTIQO_VOICE_STT_REALTIME_V1"
assert app.CAPABILITY == "ai.speech.to.text.realtime"
print("AVANTIQO_VOICE_REALTIME_STT_IMAGE_IMPORT_SMOKE=PASS")
PY

EXPOSE 80
CMD ["python", "-u", "app.py"]
