FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel

ARG DEBIAN_FRONTEND=noninteractive
ARG FLASHVSR_COMMIT=0ef95713cd336ee89a921fc2fbc2933aaf9e5f4a
ARG BLOCK_SPARSE_COMMIT=49d6c39e4dc0303442cda3bb758b3925d4399c49

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/opt/FlashVSR:/opt/FlashVSR/examples/WanVSR \
    AVANTIQO_FLASHVSR_WEIGHTS_ROOT=/runpod-volume/flashvsr/FlashVSR-v1.1 \
    BLOCK_SPARSE_ATTN_CUDA_ARCHS=80 \
    TORCH_CUDA_ARCH_LIST=8.0 \
    MAX_JOBS=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    git \
    ninja-build \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel && \
    python -m pip install \
      packaging==24.2 \
      ninja==1.11.1.3 \
      numpy==1.26.4 \
      pillow==11.0.0 \
      einops==0.8.1 \
      accelerate==1.8.1 \
      huggingface-hub==0.34.4 \
      safetensors==0.5.3 \
      transformers==4.46.2 \
      peft==0.16.0 \
      torchsde==0.2.6 \
      protobuf==3.20.3 \
      ftfy==6.3.1 \
      pandas==2.3.0 \
      tqdm==4.67.1 \
      datasets==3.6.0 \
      torchmetrics==1.7.3 \
      pytorch-lightning==2.5.2 \
      opencv-python-headless==4.11.0.86 \
      sentencepiece==0.2.0 \
      imageio==2.37.0

RUN git clone https://github.com/mit-han-lab/Block-Sparse-Attention.git /opt/Block-Sparse-Attention && \
    cd /opt/Block-Sparse-Attention && \
    git checkout ${BLOCK_SPARSE_COMMIT} && \
    python setup.py install

RUN git clone https://github.com/OpenImagingLab/FlashVSR.git /opt/FlashVSR && \
    cd /opt/FlashVSR && \
    git checkout ${FLASHVSR_COMMIT}

WORKDIR /app
COPY flashvsr_worker.py /app/flashvsr_worker.py
RUN python -m py_compile /app/flashvsr_worker.py

CMD ["python", "-u", "/app/flashvsr_worker.py"]
