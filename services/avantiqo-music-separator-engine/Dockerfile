FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TORCH_HOME=/opt/avantiqo-demucs-cache \
    AVANTIQO_MUSIC_SEPARATOR_MAX_SOURCE_DURATION_SECONDS=900

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      ffmpeg \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python3 -m pip install --no-cache-dir \
      torch==2.7.1 \
      torchaudio==2.7.1 \
      --index-url https://download.pytorch.org/whl/cu128

COPY services/avantiqo-music-separator-engine/requirements.txt /app/requirements.txt
RUN python3 -m pip install --no-cache-dir -r /app/requirements.txt

RUN mkdir -p "${TORCH_HOME}" \
    && python3 - <<'PY'
from demucs.pretrained import get_model
model = get_model("htdemucs_ft")
assert model is not None
print("AVANTIQO_MUSIC_SEPARATOR_MODEL_PREFETCH=PASS")
PY

COPY services/avantiqo-music-separator-engine/handler.py /app/handler.py

RUN python3 -m py_compile /app/handler.py \
    && ffmpeg -version >/dev/null \
    && ffprobe -version >/dev/null \
    && python3 - <<'PY'
import torch
import demucs
assert torch.version.cuda is not None
print("AVANTIQO_MUSIC_SEPARATOR_IMAGE_SMOKE=PASS")
PY

CMD ["python3", "/app/handler.py"]
