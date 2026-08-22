FROM python:3.11-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_LINK_MODE=copy

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git ca-certificates curl build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/ace-step
RUN git clone https://github.com/ACE-Step/ACE-Step-1.5.git . \
    && git checkout 14c0211d5a0653b0f63e27686f4c3f151b4d8629

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv sync --frozen --no-dev

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
    AVANTIQO_AUDIO_MODEL_VARIANT=acestep-v15-turbo \
    AVANTIQO_AUDIO_MODEL_SOURCE=huggingface

CMD ["/opt/ace-step/.venv/bin/python", "-u", "/app/handler.py"]
