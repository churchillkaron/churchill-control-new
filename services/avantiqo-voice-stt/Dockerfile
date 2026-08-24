FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AVANTIQO_VOICE_STT_FOUNDATION_MODEL=openai/whisper-large-v3-turbo

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt
COPY handler.py ./handler.py

RUN python - <<'PY'
import runpod
import torch
import transformers
import handler

assert hasattr(runpod.serverless, "register_fitness_check")
assert torch.version.cuda, "AVANTIQO_VOICE_STT_CUDA_ENABLED_TORCH_REQUIRED"
assert handler.FOUNDATION_MODEL == "openai/whisper-large-v3-turbo"
print("AVANTIQO_VOICE_STT_IMAGE_IMPORT_SMOKE=PASS")
PY

CMD ["python", "-u", "handler.py"]
