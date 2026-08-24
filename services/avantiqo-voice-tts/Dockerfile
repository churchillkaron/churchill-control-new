FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-runtime

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
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt \
    && python -m pip install --force-reinstall \
      torch==2.7.0 torchaudio==2.7.0 \
      --index-url https://download.pytorch.org/whl/cu128
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
assert torch.__version__.startswith("2.7.0"), f"AVANTIQO_VOICE_TTS_TORCH_27_REQUIRED:{torch.__version__}"
assert torch.version.cuda.startswith("12.8"), f"AVANTIQO_VOICE_TTS_CUDA_128_REQUIRED:{torch.version.cuda}"
assert "sm_120" in torch.cuda.get_arch_list(), f"AVANTIQO_VOICE_TTS_BLACKWELL_SM120_REQUIRED:{torch.cuda.get_arch_list()}"
assert handler.FOUNDATION_MODEL == "resemble-ai/chatterbox:multilingual-v3"
print("AVANTIQO_VOICE_TTS_BLACKWELL_SM120=PASS")
print("AVANTIQO_VOICE_TTS_IMAGE_IMPORT_SMOKE=PASS")
PY

CMD ["/bin/sh", "/app/bootstrap.sh"]
