FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AVANTIQO_VOICE_STT_FOUNDATION_MODEL=openai/whisper-large-v3-turbo \
    AVANTIQO_VOICE_STT_LOCAL_MODEL_PATH=/opt/avantiqo/models/whisper-large-v3-turbo \
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
import os
import shutil

from huggingface_hub import snapshot_download
from transformers import AutoConfig, AutoProcessor

model = "openai/whisper-large-v3-turbo"
expected_revision = "41f01f3fe87f28c78e2fbf8b568835947dd65ed9"
local_model_path = Path(os.environ["AVANTIQO_VOICE_STT_LOCAL_MODEL_PATH"])
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

local_model_path.parent.mkdir(parents=True, exist_ok=True)
if local_model_path.exists() or local_model_path.is_symlink():
    if local_model_path.is_dir() and not local_model_path.is_symlink():
        shutil.rmtree(local_model_path)
    else:
        local_model_path.unlink()
local_model_path.symlink_to(snapshot, target_is_directory=True)

AutoConfig.from_pretrained(str(local_model_path), local_files_only=True)
AutoProcessor.from_pretrained(str(local_model_path), local_files_only=True)
for required_name in ("config.json", "model.safetensors"):
    if not (local_model_path / required_name).is_file():
        raise RuntimeError(f"AVANTIQO_VOICE_STT_LOCAL_MODEL_PATH_INCOMPLETE:{required_name}")
print(f"AVANTIQO_VOICE_STT_FOUNDATION_CACHE_BAKED={resolved_revision}")
print(f"AVANTIQO_VOICE_STT_LOCAL_MODEL_PATH_READY={local_model_path}")
PY

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

COPY handler.py ./handler.py

RUN python - <<'PY'
import os
from pathlib import Path

import runpod
import torch
import transformers
import handler

assert hasattr(runpod.serverless, "register_fitness_check")
assert torch.version.cuda, "AVANTIQO_VOICE_STT_CUDA_ENABLED_TORCH_REQUIRED"
assert handler.FOUNDATION_MODEL == "openai/whisper-large-v3-turbo"
assert handler.LOCAL_MODEL_PATH == Path(os.environ["AVANTIQO_VOICE_STT_LOCAL_MODEL_PATH"])
assert (handler.LOCAL_MODEL_PATH / "config.json").is_file()
assert (handler.LOCAL_MODEL_PATH / "model.safetensors").is_file()
print("AVANTIQO_VOICE_STT_IMAGE_IMPORT_SMOKE=PASS")
PY

CMD ["python", "-u", "handler.py"]