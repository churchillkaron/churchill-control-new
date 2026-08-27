FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY services/avantiqo-music-elastic-engine/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY services/avantiqo-music-elastic-engine/handler.py ./handler.py
CMD ["python", "handler.py"]
