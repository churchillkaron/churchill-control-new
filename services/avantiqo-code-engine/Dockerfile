FROM vllm/vllm-openai:v0.27.1

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TOKENIZERS_PARALLELISM=false \
    HF_HOME=/runpod-volume/huggingface-cache \
    VLLM_WORKER_MULTIPROC_METHOD=spawn \
    AVANTIQO_CODE_DEVICE=cuda \
    AVANTIQO_CODE_QUANTIZATION=fp8 \
    AVANTIQO_CODE_FOUNDATION_MODEL=Qwen/Qwen3-Coder-30B-A3B-Instruct \
    AVANTIQO_CODE_RUNTIME_MODEL=Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8 \
    AVANTIQO_CODE_MAX_MODEL_LEN=32768 \
    AVANTIQO_CODE_GPU_MEMORY_UTILIZATION=0.90 \
    AVANTIQO_CODE_MAX_NEW_TOKENS=4096

WORKDIR /app

# This Dockerfile is intentionally valid when the build context is the Code
# service directory. Keep it runtime-equivalent to Dockerfile.runpod so the
# endpoint cannot silently deploy a non-vLLM image when its configured
# Dockerfile path points at the ordinary service Dockerfile. The requirements
# pin RunPod to the newest SDK whose FastAPI range is compatible with vLLM.
COPY requirements.txt ./requirements.txt
RUN uv pip install --system -r requirements.txt \
    && python3 -c "from importlib.metadata import version; import runpod, vllm; assert version('runpod') == '1.10.0', version('runpod'); assert version('vllm') == '0.27.1', version('vllm'); print('AVANTIQO_CODE_VLLM_BUILD_CHECK=PASS')"
COPY handler.py ./handler.py
RUN python3 -m py_compile handler.py

# vllm-openai defines its own `vllm serve` entrypoint; replace it completely
# because RunPod invokes the bounded Avantiqo worker handler.
ENTRYPOINT ["python3", "-u", "handler.py"]
