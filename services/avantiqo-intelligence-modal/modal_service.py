"""Authenticated CPU-only async gateway for Avantiqo Intelligence Fast + Deep."""
from __future__ import annotations

import hmac
import os
from typing import Any

import modal

GATEWAY_APP_NAME = "avantiqo-intelligence-gateway"
GPU_APP_NAME = "avantiqo-intelligence-owned"
ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_INTELLIGENCE_ENGINE_V2"
HTTP_CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_HTTP_V1"
TRANSPORT = "modal-function-call"
GATEWAY_SECRET_NAME = "avantiqo-intelligence-gateway"
GATEWAY_TOKEN_ENV = "AVANTIQO_INTELLIGENCE_GATEWAY_TOKEN"
LANES = {"fast", "deep"}

app = modal.App(GATEWAY_APP_NAME)
api_image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi==0.115.6")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _safe(value: Any, depth: int = 0) -> Any:
    if depth > 10:
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


def _boundary() -> dict[str, Any]:
    return {
        "contract": HTTP_CONTRACT,
        "transport": TRANSPORT,
        "infrastructure_provider": "MODAL_H100_ASYNC_V1",
        "modal_gpu": "H100",
        "scale_to_zero": True,
        "persistent_model_volume": False,
        "runpod_inference_performed": False,
        "raw_reasoning_persisted": False,
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
def intelligence_api():
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import JSONResponse

    token = _text(os.environ.get(GATEWAY_TOKEN_ENV))
    if len(token) < 40:
        raise RuntimeError("AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN_INVALID")
    expected = f"Bearer {token}"
    web = FastAPI(title="Avantiqo Intelligence Modal Gateway", docs_url=None, redoc_url=None)

    @web.middleware("http")
    async def authenticate(request: Request, call_next):
        supplied = _text(request.headers.get("authorization"))
        if not hmac.compare_digest(supplied, expected):
            return JSONResponse(
                status_code=401,
                content={"detail": "AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_UNAUTHORIZED"},
            )
        return await call_next(request)

    @web.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "success": True,
            **_boundary(),
            "engine_contract": ENGINE_CONTRACT,
            "gateway_app": GATEWAY_APP_NAME,
            "gpu_app": GPU_APP_NAME,
            "gpu_functions": ["fast", "deep"],
            "gpu_worker": "H100",
            "async_job_queue": True,
            "gateway_auth_required": True,
            "gateway_gpu_imported": False,
            "model_storage": "IMMUTABLE_MODAL_IMAGE_LAYERS",
            "max_gpu_containers_per_lane": 1,
            "gpu_inference_performed": False,
            "runpod_used": False,
        }

    @web.post("/v1/jobs")
    async def submit(data: dict[str, Any]) -> dict[str, Any]:
        if _text(data.get("engine_contract")) != ENGINE_CONTRACT:
            raise HTTPException(status_code=400, detail="AVANTIQO_INTELLIGENCE_ENGINE_CONTRACT_INVALID")
        lane = _text(data.get("execution_lane")).lower()
        if lane not in LANES:
            raise HTTPException(status_code=400, detail="AVANTIQO_INTELLIGENCE_EXECUTION_LANE_INVALID")

        # Canonical provider sends the governed model input as the top-level job
        # body. Retain support for an explicit nested `input` envelope so older
        # internal callers remain compatible without changing the GPU contract.
        nested = data.get("input")
        payload = nested if isinstance(nested, dict) and nested else data
        if not isinstance(payload, dict) or not payload:
            raise HTTPException(status_code=400, detail="AVANTIQO_INTELLIGENCE_INPUT_REQUIRED")
        payload = {**payload, "engine_contract": ENGINE_CONTRACT, "execution_lane": lane}

        function = modal.Function.from_name(GPU_APP_NAME, lane)
        call = function.spawn(payload)
        call_id = _text(getattr(call, "object_id", ""))
        if not call_id:
            raise HTTPException(status_code=502, detail="AVANTIQO_INTELLIGENCE_MODAL_CALL_ID_REQUIRED")
        return {
            "success": True,
            **_boundary(),
            "status": "QUEUED",
            "job_id": call_id,
            "provider_job_id": call_id,
            "execution_lane": lane,
            "proxy_timeout_safe": True,
        }

    @web.get("/v1/jobs/{call_id}")
    async def status(call_id: str) -> dict[str, Any]:
        clean_id = _text(call_id)
        if not clean_id or len(clean_id) > 240:
            raise HTTPException(status_code=400, detail="AVANTIQO_INTELLIGENCE_MODAL_CALL_ID_INVALID")
        call = modal.FunctionCall.from_id(clean_id)
        try:
            result = call.get(timeout=0)
        except TimeoutError:
            return {
                "success": True,
                **_boundary(),
                "status": "RUNNING",
                "job_id": clean_id,
                "provider_job_id": clean_id,
            }
        except Exception as exc:
            return {
                "success": False,
                **_boundary(),
                "status": "FAILED",
                "job_id": clean_id,
                "provider_job_id": clean_id,
                "error_code": f"AVANTIQO_INTELLIGENCE_MODAL_JOB_FAILED:{type(exc).__name__}",
                "error_message": "Avantiqo Intelligence Modal execution failed",
            }
        safe_result = _safe(result)
        return {
            "success": True,
            **_boundary(),
            "status": "SUCCEEDED",
            "job_id": clean_id,
            "provider_job_id": clean_id,
            "output": safe_result,
        }

    return web
