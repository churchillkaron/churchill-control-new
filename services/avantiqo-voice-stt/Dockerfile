FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AVANTIQO_VOICE_STT_FOUNDATION_MODEL=openai/whisper-large-v3-turbo \
    HF_HOME=/opt/avantiqo/huggingface \
    HF_HUB_CACHE=/opt/avantiqo/huggingface/hub \
    HF_HUB_DISABLE_TELEMETRY=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt

RUN python - <<'PY'
from pathlib import Path

from huggingface_hub import snapshot_download
from transformers import AutoConfig, AutoProcessor

model = "openai/whisper-large-v3-turbo"
expected_revision = "41f01f3fe87f28c78e2fbf8b568835947dd65ed9"
snapshot = Path(snapshot_download(repo_id=model, revision="main"))
resolved_revision = snapshot.name
if resolved_revision != expected_revision:
    raise RuntimeError(
        f"AVANTIQO_VOICE_STT_FOUNDATION_REVISION_CHANGED:{resolved_revision}:{expected_revision}"
    )
required = [
    snapshot / "config.json",
    snapshot / "model.safetensors",
]
missing = [str(path) for path in required if not path.is_file()]
if missing:
    raise RuntimeError(f"AVANTIQO_VOICE_STT_FOUNDATION_CACHE_INCOMPLETE:{','.join(missing)}")
AutoConfig.from_pretrained(model, local_files_only=True)
AutoProcessor.from_pretrained(model, local_files_only=True)
print(f"AVANTIQO_VOICE_STT_FOUNDATION_CACHE_BAKED={resolved_revision}")
PY

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

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
