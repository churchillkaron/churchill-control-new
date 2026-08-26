FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TORCH_HOME=/opt/avantiqo-vocal-correction-cache \
    AVANTIQO_MUSIC_VOCAL_CORRECTION_MAX_SOURCE_DURATION_SECONDS=900

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      ffmpeg \
      libsndfile1 \
      python3 \
      python3-dev \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m pip install --no-cache-dir --upgrade pip setuptools wheel \
    && python3 -m pip install --no-cache-dir \
      torch==2.7.1 \
      torchaudio==2.7.1 \
      --index-url https://download.pytorch.org/whl/cu128

COPY services/avantiqo-music-vocal-correction-engine/requirements.txt /app/requirements.txt
RUN python3 -m pip install --no-cache-dir -r /app/requirements.txt

RUN mkdir -p "${TORCH_HOME}" \
    && python3 - <<'PY'
import numpy as np
import python_stretch as ps
import torch
import torchcrepe

assert torch.version.cuda is not None
stretch = ps.Signalsmith.Stretch()
stretch.preset(1, 48000)
stretch.setTransposeSemitones(0.0)
stretch.timeFactor = 1.0
probe = np.zeros((1, 4800), dtype=np.float32)
processed = stretch.process(probe)
assert processed is not None
assert hasattr(torchcrepe, "predict")
print("AVANTIQO_MUSIC_VOCAL_CORRECTION_DEPENDENCY_SMOKE=PASS")
PY

COPY services/avantiqo-music-vocal-correction-engine/handler.py /app/handler.py
COPY services/avantiqo-music-vocal-correction-engine/key_parser.py /app/key_parser.py
COPY services/avantiqo-music-vocal-correction-engine/timing.py /app/timing.py
COPY services/avantiqo-music-vocal-correction-engine/handler_v2.py /app/handler_v2.py

RUN python3 -m py_compile /app/handler.py /app/key_parser.py /app/timing.py /app/handler_v2.py

RUN python3 - <<'PY'
import torch
import torchcrepe
from key_parser import key_parser_self_test

key_result = key_parser_self_test()
assert key_result["success"] is True, key_result
sample_rate = 16000
samples = torch.zeros((1, sample_rate), dtype=torch.float32)
pitch, periodicity = torchcrepe.predict(
    samples,
    sample_rate,
    160,
    55.0,
    1200.0,
    "tiny",
    batch_size=128,
    device="cpu",
    return_periodicity=True,
    decoder=torchcrepe.decode.viterbi,
)
assert pitch.shape[-1] > 0
assert periodicity.shape == pitch.shape
print("AVANTIQO_MUSIC_VOCAL_CORRECTION_TORCHCREPE_INFERENCE_SMOKE=PASS")
print("AVANTIQO_MUSIC_VOCAL_KEY_PARSER_SELF_TEST=PASS")
PY

RUN ffmpeg -version >/dev/null && ffprobe -version >/dev/null

CMD ["python3", "/app/handler_v2.py"]
