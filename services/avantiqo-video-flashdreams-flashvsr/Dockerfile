FROM nvidia/cuda:13.0.2-cudnn-devel-ubuntu24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG FLASHDREAMS_COMMIT=289da6f1d232de5abaa30d686c977b9c0040fe76

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FLASHDREAMS_CACHE_DIR=/runpod-volume/flashdreams-cache \
    AVANTIQO_FLASHVSR_WEIGHTS_ROOT=/runpod-volume/flashvsr/FlashVSR-v1.1 \
    AVANTIQO_FLASHVSR_PROMPT_PATH=/opt/avantiqo-flashvsr/posi_prompt.pth \
    MAX_JOBS=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    build-essential \
    ninja-build \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH=/root/.local/bin:$PATH

RUN git clone https://github.com/NVIDIA/flashdreams.git /opt/flashdreams && \
    cd /opt/flashdreams && \
    git checkout ${FLASHDREAMS_COMMIT} && \
    uv sync --group cuda13 --extra runners --package flashdreams --package flashdreams-flashvsr

RUN mkdir -p /opt/avantiqo-flashvsr && \
    curl -fsSL https://raw.githubusercontent.com/OpenImagingLab/FlashVSR/0ef95713cd336ee89a921fc2fbc2933aaf9e5f4a/examples/WanVSR/prompt_tensor/posi_prompt.pth \
      -o /opt/avantiqo-flashvsr/posi_prompt.pth && \
    test -s /opt/avantiqo-flashvsr/posi_prompt.pth

WORKDIR /app
COPY flashdreams_flashvsr_worker.py /app/flashdreams_flashvsr_worker.py
RUN /opt/flashdreams/.venv/bin/python -m py_compile /app/flashdreams_flashvsr_worker.py

CMD ["/opt/flashdreams/.venv/bin/python", "-u", "/app/flashdreams_flashvsr_worker.py"]
