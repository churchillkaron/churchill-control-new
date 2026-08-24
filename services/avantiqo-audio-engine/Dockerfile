# Keep the owned Audio worker on the CUDA/Python runtime used by the exact
# ACE-Step 1.5 source lock below. RunPod supplies the NVIDIA driver; the image
# supplies the matching CUDA 12.8 userspace and audio/runtime dependencies.
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

# Match the locked upstream Docker contract: Python 3.11 plus the exact uv lock.
RUN uv sync --frozen --no-dev --python python3.11

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN uv pip install --python /opt/ace-step/.venv/bin/python -r requirements.txt
COPY handler.py ./handler.py

RUN mkdir -p /tmp/avantiqo-audio /opt/ace-step/checkpoints
ENV PATH="/opt/ace-step/.venv/bin:${PATH}" \
    PYTHONPATH="/opt/ace-step" \
    ACESTEP_PROJECT_ROOT=/opt/ace-step \
    ACESTEP_CHECKPOINTS_DIR=/opt/ace-step/checkpoints \
    AVANTIQO_AUDIO_OUTPUT_DIR=/tmp/avantiqo-audio \
    AVANTIQO_AUDIO_DEVICE=cuda \
    AVANTIQO_AUDIO_MODEL_FAMILY=ACE_STEP_1_5 \
    AVANTIQO_AUDIO_FOUNDATION_MODEL=ACE-Step/Ace-Step1.5 \
    AVANTIQO_AUDIO_MODEL_VARIANT=acestep-v15-xl-turbo \
    AVANTIQO_AUDIO_LM_MODEL=acestep-5Hz-lm-1.7B \
    AVANTIQO_AUDIO_LM_BACKEND=vllm \
    ACESTEP_INIT_LLM=true \
    AVANTIQO_AUDIO_MODEL_SOURCE=huggingface

# Build-time smoke deliberately does not require physical GPU access. It proves
# that the locked environment contains the CUDA 12.8 PyTorch stack, native audio
# libraries, XL DiT + 1.7B LM symbols, and the owned quality contract before an
# immutable image can be accepted for RunPod.
RUN /opt/ace-step/.venv/bin/python -c "import torch, torchaudio, soundfile; import handler; from acestep.handler import AceStepHandler; from acestep.inference import GenerationConfig, GenerationParams, generate_music; from acestep.llm_inference import LLMHandler; from acestep.model_downloader import ensure_lm_model; handler._validate_model_contract(); assert handler.MODEL_VARIANT == 'acestep-v15-xl-turbo', 'AVANTIQO_AUDIO_XL_MODEL_REQUIRED'; assert handler.LM_MODEL == 'acestep-5Hz-lm-1.7B', 'AVANTIQO_AUDIO_1_7B_LM_REQUIRED'; assert handler.INIT_LLM, 'AVANTIQO_AUDIO_LM_INIT_REQUIRED'; assert torch.version.cuda and str(torch.version.cuda).startswith('12.8'), 'AVANTIQO_AUDIO_CUDA_12_8_TORCH_REQUIRED'; print('AVANTIQO_AUDIO_IMAGE_IMPORT_SMOKE=PASS'); print('AVANTIQO_AUDIO_QUALITY_PROFILE=' + handler.QUALITY_PROFILE); print('AVANTIQO_AUDIO_TORCH_CUDA_RUNTIME=' + str(torch.version.cuda)); print('AVANTIQO_AUDIO_NATIVE_AUDIO_IMPORTS=PASS')"

CMD ["/opt/ace-step/.venv/bin/python", "-u", "/app/handler.py"]
