FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/opt/avantiqo/huggingface \
    AVANTIQO_VOICE_TTS_FOUNDATION_MODEL=resemble-ai/chatterbox:multilingual-v3 \
    AVANTIQO_VOICE_TTS_DEVICE=cuda

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt

# Resemble's Multilingual V3 source still reports package version 0.1.7, while
# the older PyPI 0.1.7 artifact does not expose the V3 t3_model loader argument.
# Install the exact V3 source commit from requirements.txt, while retaining the
# Blackwell-capable CUDA 12.8 / PyTorch 2.7 stack owned by this image.
RUN python -m pip install --upgrade pip packaging \
    && python -m pip install "$(grep '^runpod==' requirements.txt)" \
    && CHATTERBOX_SOURCE="$(sed -n 's/^chatterbox-tts @ //p' requirements.txt)" \
    && test -n "$CHATTERBOX_SOURCE" \
    && python -m pip install --no-deps "$CHATTERBOX_SOURCE"

RUN python - <<'PY'
from importlib.metadata import requires
import subprocess
import sys

from packaging.requirements import Requirement

excluded = {"torch", "torchaudio"}
dependencies = []
for raw_requirement in requires("chatterbox-tts") or []:
    requirement = Requirement(raw_requirement)
    normalized_name = requirement.name.lower().replace("_", "-")
    if normalized_name in excluded:
        continue
    dependencies.append(str(requirement))

if not dependencies:
    raise RuntimeError("AVANTIQO_VOICE_TTS_CHATTERBOX_DEPENDENCIES_REQUIRED")

subprocess.check_call([sys.executable, "-m", "pip", "install", *dependencies])
PY

# Keep the base image's Blackwell-capable torch and add the matching cu128
# torchaudio wheel without re-downloading/replacing the full CUDA torch stack.
RUN python -m pip install --no-deps \
      torch==2.7.0 torchaudio==2.7.0 \
      --index-url https://download.pytorch.org/whl/cu128

# Chatterbox's multilingual loader calls snapshot_download() on the first TTS
# request. V3 needs roughly 3.2 GB of model data, which can turn a tiny speech
# request into a many-minute IN_PROGRESS download on an ephemeral worker.
# Bake the exact known V3 snapshot into the image and seed refs/main so the
# unchanged upstream loader can resolve revision="main" entirely offline.
RUN python - <<'PY'
from pathlib import Path
from huggingface_hub import snapshot_download

repo_id = "ResembleAI/chatterbox"
revision = "e2d6902dd4c1301892935d0a0277325551e8060e"
required_files = [
    "ve.pt",
    "t3_mtl23ls_v3.safetensors",
    "s3gen.pt",
    "grapheme_mtl_merged_expanded_v1.json",
    "conds.pt",
    "Cangjie5_TC.json",
]

snapshot = Path(snapshot_download(
    repo_id=repo_id,
    repo_type="model",
    revision=revision,
    allow_patterns=required_files,
))
missing = [name for name in required_files if not (snapshot / name).is_file()]
if missing:
    raise RuntimeError(f"AVANTIQO_VOICE_TTS_BAKED_MODEL_FILES_MISSING:{missing}")

sizes = {name: (snapshot / name).stat().st_size for name in required_files}
if sizes["t3_mtl23ls_v3.safetensors"] < 2_000_000_000:
    raise RuntimeError("AVANTIQO_VOICE_TTS_BAKED_T3_V3_INVALID")
if sizes["s3gen.pt"] < 1_000_000_000:
    raise RuntimeError("AVANTIQO_VOICE_TTS_BAKED_S3GEN_INVALID")

cache_root = snapshot.parents[1]
refs_dir = cache_root / "refs"
refs_dir.mkdir(parents=True, exist_ok=True)
ref_path = refs_dir / "main"
ref_path.write_text(revision, encoding="utf-8")
if ref_path.read_text(encoding="utf-8") != revision:
    raise RuntimeError("AVANTIQO_VOICE_TTS_BAKED_MAIN_REF_INVALID")

# Mirror ChatterboxMultilingualTTS.from_pretrained exactly: the upstream
# runtime intentionally requests only these six files. Prove that identical
# partial-snapshot lookup resolves from refs/main without network access.
offline_snapshot = Path(snapshot_download(
    repo_id=repo_id,
    repo_type="model",
    revision="main",
    allow_patterns=required_files,
    local_files_only=True,
))
if offline_snapshot.resolve() != snapshot.resolve():
    raise RuntimeError(
        "AVANTIQO_VOICE_TTS_BAKED_OFFLINE_MAIN_MISMATCH:"
        f"expected={snapshot}:actual={offline_snapshot}"
    )
offline_missing = [name for name in required_files if not (offline_snapshot / name).is_file()]
if offline_missing:
    raise RuntimeError(f"AVANTIQO_VOICE_TTS_BAKED_OFFLINE_FILES_MISSING:{offline_missing}")

print(f"AVANTIQO_VOICE_TTS_BAKED_MODEL_REVISION={revision}")
print(f"AVANTIQO_VOICE_TTS_BAKED_MODEL_BYTES={sum(sizes.values())}")
print("AVANTIQO_VOICE_TTS_BAKED_OFFLINE_MAIN=PASS")
print("AVANTIQO_VOICE_TTS_BAKED_MODEL=PASS")
PY

# Runtime workers must use only the image-baked checkpoint. This prevents a
# cold request from silently downloading multi-gigabyte model files again.
ENV HF_HUB_OFFLINE=1

COPY handler.py ./handler.py
COPY bootstrap.sh ./bootstrap.sh

RUN python - <<'PY'
import inspect
import runpod
import torch
import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
import handler

assert hasattr(runpod.serverless, "register_fitness_check")
assert torch.version.cuda, "AVANTIQO_VOICE_TTS_CUDA_ENABLED_TORCH_REQUIRED"
assert torch.__version__.startswith("2.7.0"), f"AVANTIQO_VOICE_TTS_TORCH_27_REQUIRED:{torch.__version__}"
assert torchaudio.__version__.startswith("2.7.0"), f"AVANTIQO_VOICE_TTS_TORCHAUDIO_27_REQUIRED:{torchaudio.__version__}"
assert torch.version.cuda.startswith("12.8"), f"AVANTIQO_VOICE_TTS_CUDA_128_REQUIRED:{torch.version.cuda}"
compiled_arches = (torch._C._cuda_getArchFlags() or "").split()
assert "sm_120" in compiled_arches, f"AVANTIQO_VOICE_TTS_BLACKWELL_SM120_REQUIRED:{compiled_arches}"
from_pretrained_parameters = inspect.signature(ChatterboxMultilingualTTS.from_pretrained).parameters
assert "t3_model" in from_pretrained_parameters, (
    "AVANTIQO_VOICE_TTS_CHATTERBOX_V3_API_REQUIRED:"
    f"parameters={sorted(from_pretrained_parameters)}"
)
assert handler.FOUNDATION_MODEL == "resemble-ai/chatterbox:multilingual-v3"
print("AVANTIQO_VOICE_TTS_CHATTERBOX_V3_API=PASS")
print("AVANTIQO_VOICE_TTS_CHATTERBOX_TORCH_OVERRIDE=PASS")
print("AVANTIQO_VOICE_TTS_BLACKWELL_SM120=PASS")
print("AVANTIQO_VOICE_TTS_IMAGE_IMPORT_SMOKE=PASS")
PY

CMD ["python", "-u", "/app/handler.py"]