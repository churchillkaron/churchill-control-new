ARG CUDA_VERSION=12.8.1
FROM nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends \
        software-properties-common \
        build-essential \
        git \
        curl \
        ca-certificates \
        libsndfile1 \
        libsndfile1-dev \
        ffmpeg \
        libffi-dev \
        libssl-dev \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        python3.11 \
        python3.11-dev \
        python3.11-venv \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.7 /uv /uvx /bin/

WORKDIR /opt/ace-step
RUN git clone https://github.com/ACE-Step/ACE-Step-1.5.git . \
    && git checkout 14c0211d5a0653b0f63e27686f4c3f151b4d8629

RUN uv sync --frozen --no-dev --python python3.11

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN uv pip install --python /opt/ace-step/.venv/bin/python -r requirements.txt
COPY handler.py ./handler.py

RUN mkdir -p /tmp/avantiqo-music-extend /opt/ace-step/checkpoints
ENV PATH="/opt/ace-step/.venv/bin:${PATH}" \
    PYTHONPATH="/opt/ace-step" \
    ACESTEP_PROJECT_ROOT=/opt/ace-step \
    ACESTEP_CHECKPOINTS_DIR=/opt/ace-step/checkpoints \
    AVANTIQO_MUSIC_EXTEND_OUTPUT_DIR=/tmp/avantiqo-music-extend \
    AVANTIQO_MUSIC_EXTEND_DEVICE=cuda \
    AVANTIQO_MUSIC_EXTEND_FOUNDATION_MODEL=ACE-Step/Ace-Step1.5 \
    AVANTIQO_MUSIC_EXTEND_MODEL_FAMILY=ACE_STEP_1_5 \
    AVANTIQO_MUSIC_EXTEND_MODEL_VARIANT=acestep-v15-base \
    AVANTIQO_MUSIC_EXTEND_MODEL_SOURCE=huggingface \
    AVANTIQO_MUSIC_EXTEND_PRODUCTION_CERTIFIED=false \
    ACESTEP_INIT_LLM=false

# Build-time smoke is GPU-free. It proves the exact pinned upstream source exposes
# Base-only Complete and that the owned handler rejects XL Turbo / LM fallback.
RUN /opt/ace-step/.venv/bin/python -c "import torch, torchaudio, soundfile; import handler; from acestep.constants import TASK_TYPES_BASE, TASK_TYPES_TURBO; from acestep.inference import GenerationConfig, GenerationParams, DIRECT_CONDITIONING_TASKS; handler._validate_model_contract(); assert handler.MODEL_VARIANT == 'acestep-v15-base', 'AVANTIQO_MUSIC_EXTEND_BASE_MODEL_REQUIRED'; assert 'complete' in TASK_TYPES_BASE, 'AVANTIQO_MUSIC_EXTEND_COMPLETE_BASE_TASK_REQUIRED'; assert 'complete' not in TASK_TYPES_TURBO, 'AVANTIQO_MUSIC_EXTEND_TURBO_COMPLETE_FORBIDDEN'; assert 'complete' in DIRECT_CONDITIONING_TASKS, 'AVANTIQO_MUSIC_EXTEND_DIRECT_CONDITIONING_REQUIRED'; assert handler.INIT_LLM is False, 'AVANTIQO_MUSIC_EXTEND_LM_MUST_BE_OFF'; assert torch.version.cuda and str(torch.version.cuda).startswith('12.8'), 'AVANTIQO_MUSIC_EXTEND_CUDA_12_8_TORCH_REQUIRED'; print('AVANTIQO_MUSIC_EXTEND_IMAGE_IMPORT_SMOKE=PASS'); print('AVANTIQO_MUSIC_EXTEND_BASE_COMPLETE_CONTRACT=PASS'); print('AVANTIQO_MUSIC_EXTEND_NATIVE_AUDIO_IMPORTS=PASS')"

CMD ["/opt/ace-step/.venv/bin/python", "-u", "/app/handler.py"]
