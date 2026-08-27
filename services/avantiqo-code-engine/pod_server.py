import asyncio
import hmac
import json
import os
import traceback
from typing import Any

# Pods mount RunPod network volumes at /workspace, while Serverless mounts the
# same volume at /runpod-volume. Override the cache path before importing the
# shared Code engine so both transports resolve the same persisted model cache.
os.environ.setdefault("HF_HOME", "/workspace/huggingface-cache")
os.environ.setdefault("AVANTIQO_CODE_HF_CACHE_ROOT", "/workspace/huggingface-cache/hub")
os.environ.setdefault("AVANTIQO_CODE_TRANSPORT", "pod-http")

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
import uvicorn

import handler as code_engine

CONTRACT = "AVANTIQO_CODE_POD_HTTP_V1"
HOST = "0.0.0.0"
PORT = int(os.getenv("AVANTIQO_CODE_POD_PORT", "8000"))
POD_TOKEN = os.getenv("AVANTIQO_CODE_POD_TOKEN", "").strip()
MAX_CONCURRENCY = 1

if len(POD_TOKEN) < 32:
    raise RuntimeError("AVANTIQO_CODE_POD_TOKEN_REQUIRED_MIN_32_CHARS")

app = FastAPI(
    title="Avantiqo Code Pod",
    version="1",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
_request_gate = asyncio.Semaphore(MAX_CONCURRENCY)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _authorize(authorization: str | None) -> None:
    supplied = _text(authorization)
    if not supplied.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="AVANTIQO_CODE_POD_AUTH_REQUIRED")
    candidate = supplied[7:].strip()
    if not hmac.compare_digest(candidate, POD_TOKEN):
        raise HTTPException(status_code=403, detail="AVANTIQO_CODE_POD_AUTH_INVALID")


def _pod_progress(job: dict[str, Any], message: str) -> None:
    print(
        json.dumps(
            {
                "event": "AVANTIQO_CODE_POD_PROGRESS",
                "contract": CONTRACT,
                "message": _text(message)[:200],
                "job_id_present": bool(_text(job.get("id"))),
                "serverless_progress_update_performed": False,
                "secrets_printed": False,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )


# The shared engine owns capability validation, model loading, token accounting,
# output sanitization, and generation. Only the Serverless progress callback is
# transport-specific, so replace that one callback for Pod execution.
code_engine.runpod.serverless.progress_update = _pod_progress


@app.get("/health")
async def health() -> dict[str, Any]:
    code_engine.check_worker()
    cached_path = code_engine._cached_model_path(code_engine.RUNTIME_MODEL)
    return {
        "success": True,
        "contract": CONTRACT,
        "provider": "avantiqo-code",
        "engine_contract": code_engine.ENGINE_CONTRACT,
        "transport": "pod-http",
        "runtime_model": code_engine.RUNTIME_MODEL,
        "foundation_model": code_engine.FOUNDATION_MODEL,
        "quantization": code_engine.QUANTIZATION,
        "cached_model_found": bool(cached_path),
        "engine_loaded": code_engine._ENGINE is not None,
        "max_concurrency": MAX_CONCURRENCY,
        "raw_reasoning_persisted": False,
    }


@app.post("/run")
async def run(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
):
    _authorize(authorization)
    if not isinstance(payload, dict) or not isinstance(payload.get("input"), dict):
        raise HTTPException(status_code=400, detail="AVANTIQO_CODE_POD_INPUT_REQUIRED")

    job = {
        "id": _text(payload.get("id")) or "pod-http",
        "input": payload["input"],
    }

    async with _request_gate:
        try:
            result = await asyncio.to_thread(code_engine.handler, job)
            return {
                "success": True,
                "contract": CONTRACT,
                "transport": "pod-http",
                "output": result,
            }
        except (ValueError, RuntimeError) as error:
            traceback.print_exc()
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "contract": CONTRACT,
                    "transport": "pod-http",
                    "error_type": type(error).__name__,
                    "error_message": _text(error)[:800],
                    "raw_reasoning_persisted": False,
                },
            )
        except Exception as error:
            traceback.print_exc()
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "contract": CONTRACT,
                    "transport": "pod-http",
                    "error_type": type(error).__name__,
                    "error_message": _text(error)[:800],
                    "raw_reasoning_persisted": False,
                },
            )


if __name__ == "__main__":
    print(
        json.dumps(
            {
                "event": "AVANTIQO_CODE_POD_HTTP_START",
                "contract": CONTRACT,
                "host": HOST,
                "port": PORT,
                "cache_root": str(code_engine.HF_CACHE_ROOT),
                "max_concurrency": MAX_CONCURRENCY,
                "model_load": "LAZY",
                "secrets_printed": False,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    uvicorn.run(app, host=HOST, port=PORT, workers=1, log_level="info")
