FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv ffmpeg git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python3 -m pip install --upgrade pip && python3 -m pip install -r requirements.txt
COPY app.py ./app.py

RUN mkdir -p /data/outputs
ENV AVANTIQO_VIDEO_OUTPUT_DIR=/data/outputs \
    AVANTIQO_VIDEO_DEVICE=cuda \
    AVANTIQO_VIDEO_FOUNDATION_MODEL=Wan-AI/Wan2.2-TI2V-5B-Diffusers

EXPOSE 8000
CMD ["python3", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
