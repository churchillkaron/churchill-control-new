FROM pytorch/pytorch:2.7.1-cuda12.8-cudnn9-runtime

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt
COPY handler.py ./handler.py
COPY handler_v2.py ./handler_v2.py

RUN mkdir -p /tmp/avantiqo-image
ENV AVANTIQO_IMAGE_OUTPUT_DIR=/tmp/avantiqo-image \
    AVANTIQO_IMAGE_DEVICE=cuda

CMD ["python", "-u", "handler_v2.py"]
