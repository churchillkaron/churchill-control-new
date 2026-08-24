FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AVANTIQO_VOICE_TTS_FOUNDATION_MODEL=resemble-ai/chatterbox:multilingual-v3 \
    AVANTIQO_VOICE_TTS_DEVICE=cuda

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt
COPY handler.py ./handler.py
COPY bootstrap.sh ./bootstrap.sh

RUN python - <<'PY'
import runpod
import torch
import torchaudio
import chatterbox.mtl_tts
import handler

assert hasattr(runpod.serverless, "register_fitness_check")
assert torch.version.cuda, "AVANTIQO_VOICE_TTS_CUDA_ENABLED_TORCH_REQUIRED"
assert handler.FOUNDATION_MODEL == "resemble-ai/chatterbox:multilingual-v3"
print("AVANTIQO_VOICE_TTS_IMAGE_IMPORT_SMOKE=PASS")
PY

CMD ["/bin/sh", "/app/bootstrap.sh"]
