"""Authenticated CPU-only async gateway for Avantiqo Voice Modal workers."""
from __future__ import annotations

import hmac
import os
from typing import Any

import modal

GATEWAY_APP_NAME = "avantiqo-voice-gateway"
GPU_APP_NAME = "avantiqo-voice-owned"
ENGINE_CONTRACT = "AVANTIQO_VOICE_ENGINE_V1"
HTTP_CONTRACT = "AVANTIQO_VOICE_MODAL_HTTP_V1"
TRANSPORT = "modal-function-call"
GATEWAY_SECRET_NAME = "avantiqo-voice-gateway"
GATEWAY_TOKEN_ENV = "AVANTIQO_VOICE_GATEWAY_TOKEN"
STT_CAPABILITY = "ai.speech.to.text"
TTS_CAPABILITY = "ai.text.to.speech"
FUNCTION_BY_CAPABILITY = {
    STT_CAPABILITY: "transcribe",
    TTS_CAPABILITY: "speak",
}

app = modal.App(GATEWAY_APP_NAME)
api_image = modal.Image.debian_slim(python_version="3.9").pip_install("fastapi==0.115.6")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _safe(value: Any, depth: int = 0) -> Any:
    if depth > 8:
        return "[depth-limited]"
    if isinstance(value, list):
        return [_safe(item, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    private = {
        "reasoning", "reasoning_content", "chain_of_thought", "chainofthought",
        "cot", "thoughts", "scratchpad", "analysis",
    }
    return {
        str(key): _safe(child, depth + 1)
        for key, child in value.items()
        if str(key).lower() not in private
    }


@app.function(
    image=api_image,
    secrets=[modal.Secret.from_name(GATEWAY_SECRET_NAME)],
    timeout=5 * 60,
    scaledown_window=5,
    min_containers=0,
    max_containers=4,
)
@modal.asgi_app(requires_proxy_auth=False)
def voice_api():
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import JSONResponse

    token = _text(os.environ.get(GATEWAY_TOKEN_ENV))
    if len(token) < 40:
        raise RuntimeError("AVANTIQO_VOICE_MODAL_GATEWAY_TOKEN_INVALID")
    expected = f"Bearer {token}"
    web = FastAPI(title="Avantiqo Voice Modal Gateway", docs_url=None, redoc_url=None)

    @web.middleware("http")
    async def authenticate(request: Request, call_next):
        supplied = _text(request.headers.get("authorization"))
        if not hmac.compare_digest(supplied, expected):
            return JSONResponse(
                status_code=401,
                content={"detail": "AVANTIQO_VOICE_MODAL_GATEWAY_UNAUTHORIZED"},
            )
        return await call_next(request)

    @web.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "success": True,
            "contract": HTTP_CONTRACT,
            "transport": TRANSPORT,
            "engine_contract": ENGINE_CONTRACT,
            "gateway_app": GATEWAY_APP_NAME,
            "gpu_app": GPU_APP_NAME,
            "gpu_functions": ["transcribe", "speak"],
            "gpu_worker": "A10G",
            "async_job_queue": True,
            "gateway_auth_required": True,
            "gateway_gpu_imported": False,
            "persistent_model_volume": None,
            "max_gpu_containers_per_function": 1,
            "scale_to_zero": True,
            "gpu_inference_performed": False,
            "runpod_used": False,
            "raw_reasoning_persisted": False,
        }

    @web.post("/v1/jobs")
    async def submit(data: dict[str, Any]) -> dict[str, Any]:
        if _text(data.get("contract")) != ENGINE_CONTRACT:
            raise HTTPException(status_code=400, detail="AVANTIQO_VOICE_ENGINE_CONTRACT_INVALID")
        capability = _text(data.get("capability"))
        function_name = FUNCTION_BY_CAPABILITY.get(capability)
        if not function_name:
            raise HTTPException(status_code=400, detail="AVANTIQO_VOICE_MODAL_CAPABILITY_NOT_IMPLEMENTED")
        if not _text(data.get("organization_id")):
            raise HTTPException(status_code=400, detail="AVANTIQO_VOICE_ORGANIZATION_REQUIRED")
        if not _text(data.get("usage_id")):
            raise HTTPException(status_code=400, detail="AVANTIQO_VOICE_USAGE_ID_REQUIRED")

        worker = modal.Function.from_name(GPU_APP_NAME, function_name)
        call = await worker.spawn.aio(_safe(data))
        job_id = _text(call.object_id)
        if not job_id:
            raise HTTPException(status_code=500, detail="AVANTIQO_VOICE_MODAL_CALL_ID_REQUIRED")
        return {
            "success": True,
            "contract": HTTP_CONTRACT,
            "transport": TRANSPORT,
            "status": "QUEUED",
            "job_id": job_id,
            "capability": capability,
            "gpu_function": function_name,
            "proxy_timeout_safe": True,
            "raw_reasoning_persisted": False,
        }

    @web.get("/v1/jobs/{job_id}")
    async def status(job_id: str) -> dict[str, Any]:
        normalized = _text(job_id)
        if not normalized or len(normalized) > 200:
            raise HTTPException(status_code=400, detail="AVANTIQO_VOICE_MODAL_CALL_ID_INVALID")
        call = modal.FunctionCall.from_id(normalized)
        try:
            result = await call.get.aio(timeout=0)
        except TimeoutError:
            return {
                "success": True,
                "contract": HTTP_CONTRACT,
                "transport": TRANSPORT,
                "status": "RUNNING",
                "job_id": normalized,
                "raw_reasoning_persisted": False,
            }
        except modal.exception.OutputExpiredError:
            return {
                "success": False,
                "contract": HTTP_CONTRACT,
                "transport": TRANSPORT,
                "status": "FAILED",
                "job_id": normalized,
                "error_code": "AVANTIQO_VOICE_MODAL_OUTPUT_EXPIRED",
                "raw_reasoning_persisted": False,
            }
        except Exception as exc:
            return {
                "success": False,
                "contract": HTTP_CONTRACT,
                "transport": TRANSPORT,
                "status": "FAILED",
                "job_id": normalized,
                "error_code": "AVANTIQO_VOICE_MODAL_EXECUTION_FAILED",
                "error_type": type(exc).__name__[:120],
                "error_message": _text(exc)[:800],
                "raw_reasoning_persisted": False,
            }

        if not isinstance(result, dict):
            return {
                "success": False,
                "contract": HTTP_CONTRACT,
                "transport": TRANSPORT,
                "status": "FAILED",
                "job_id": normalized,
                "error_code": "AVANTIQO_VOICE_MODAL_OUTPUT_OBJECT_REQUIRED",
                "raw_reasoning_persisted": False,
            }
        output = _safe(result)
        if output.get("raw_reasoning_persisted") is not False:
            return {
                "success": False,
                "contract": HTTP_CONTRACT,
                "transport": TRANSPORT,
                "status": "FAILED",
                "job_id": normalized,
                "error_code": "AVANTIQO_VOICE_MODAL_REASONING_BOUNDARY_INVALID",
                "raw_reasoning_persisted": False,
            }
        return {
            "success": True,
            "contract": HTTP_CONTRACT,
            "transport": TRANSPORT,
            "status": "SUCCEEDED",
            "job_id": normalized,
            "output": output,
            "raw_reasoning_persisted": False,
        }

    return web
