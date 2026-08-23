FROM pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    AVANTIQO_LATENTSYNC_ROOT=/opt/latentsync \
    AVANTIQO_LATENTSYNC_CHECKPOINT_ROOT=/runpod-volume/latentsync-1.6 \
    AVANTIQO_LIPSYNC_OUTPUT_DIR=/tmp/avantiqo-lipsync \
    HF_HOME=/runpod-volume/huggingface-cache \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg git ca-certificates libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt
RUN git clone https://github.com/bytedance/LatentSync.git latentsync \
    && cd latentsync \
    && git checkout a229c3948406bc2cf6eaf4873e662e70c6a04746 \
    && git remote remove origin

WORKDIR /opt/latentsync
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install -r requirements.txt
COPY handler.py ./handler.py
RUN mkdir -p /tmp/avantiqo-lipsync

CMD ["python", "-u", "handler.py"]
