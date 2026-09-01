"""Authenticated async HTTP transport for Avantiqo Cinema on Modal."""
from __future__ import annotations

import hmac
import os
from typing import Any

import modal

from modal_app import ENGINE_CONTRACT, PRODUCT_MODEL, app, generate

HTTP_CONTRACT = "AVANTIQO_VIDEO_MODAL_HTTP_V1"
TRANSPORT = "modal-function-call"
GATEWAY_SECRET_NAME = "avantiqo-video-gateway"
GATEWAY_TOKEN_ENV = "AVANTIQO_VIDEO_GATEWAY_TOKEN"

api_image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]")


def _text(value: Any) -> str:
    return str(value or "").strip()


def _safe(value: Any, depth: int = 0) -> Any:
    if depth > 8:
        return "[depth-limited]"
    if isinstance(value, list):
        return [_safe(item, depth + 1) for item in value]
    if not isinstance(value, dict):
        return value
    private = {"reasoning", "reasoning_content", "chain_of_thought", "chainofthought", "cot", "thoughts", "scratchpad", "analysis"}
    return {str(key): _safe(child, depth + 1) for key, child in value.items() if str(key).lower() not in private}


@app.function(
    image=api_image,
    secrets=[modal.Secret.from_name(GATEWAY_SECRET_NAME)],
    timeout=60,
    scaledown_window=5,
    min_containers=0,
    max_containers=4,
)
@modal.asgi_app(requires_proxy_auth=False)
def video_api():
    from fastapi import FastAPI, HTTPException, Request
    from fastapi.responses import JSONResponse

    token = _text(os.environ.get(GATEWAY_TOKEN_ENV))
    if len(token) < 40:
        raise RuntimeError("AVANTIQO_VIDEO_MODAL_GATEWAY_TOKEN_INVALID")
    expected = f"Bearer {token}"
    web = FastAPI(title="Avantiqo Video Modal Transport", docs_url=None, redoc_url=None)

    @web.middleware("http")
    async def authenticate(request: Request, call_next):
        supplied = _text(request.headers.get("authorization"))
        if not hmac.compare_digest(supplied, expected):
            return JSONResponse(status_code=401, content={"detail": "AVANTIQO_VIDEO_MODAL_GATEWAY_UNAUTHORIZED"})
        return await call_next(request)

    @web.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "success": True,
            "contract": HTTP_CONTRACT,
            "transport": TRANSPORT,
            "engine_contract": ENGINE_CONTRACT,
            "model": PRODUCT_MODEL,
            "gpu_worker": "A100-80GB",
            "async_job_queue": True,
            "gateway_auth_required": True,
            "persistent_model_volume": "avantiqo-video-models",
            "max_gpu_containers": 1,
            "scale_to_zero": True,
            "runpod_used": False,
        }

    @web.post("/v1/jobs")
    async def submit(data: dict[str, Any]) -> dict[str, Any]:
        if _text(data.get("contract")) != ENGINE_CONTRACT:
            raise HTTPException(status_code=400, detail="AVANTIQO_VIDEO_ENGINE_CONTRACT_INVALID")
        if _text(data.get("capability")) not in {"ai.video.generate", "ai.video.image_to_video"}:
            raise HTTPException(status_code=400, detail="AVANTIQO_VIDEO_MODAL_CAPABILITY_NOT_CERTIFIED")
        if not _text(data.get("organization_id")):
            raise HTTPException(status_code=400, detail="AVANTIQO_VIDEO_ORGANIZATION_REQUIRED")
        if not _text(data.get("usage_id")):
            raise HTTPException(status_code=400, detail="AVANTIQO_VIDEO_USAGE_ID_REQUIRED")
        call = await generate.spawn.aio(_safe(data))
        job_id = _text(call.object_id)
        if not job_id:
            raise HTTPException(status_code=500, detail="AVANTIQO_VIDEO_MODAL_CALL_ID_REQUIRED")
        return {"success": True, "contract": HTTP_CONTRACT, "transport": TRANSPORT, "status": "QUEUED", "job_id": job_id}

    @web.get("/v1/jobs/{job_id}")
    async def status(job_id: str) -> dict[str, Any]:
        normalized = _text(job_id)
        if not normalized or len(normalized) > 200:
            raise HTTPException(status_code=400, detail="AVANTIQO_VIDEO_MODAL_CALL_ID_INVALID")
        call = modal.FunctionCall.from_id(normalized)
        try:
            result = await call.get.aio(timeout=0)
        except TimeoutError:
            return {"success": True, "contract": HTTP_CONTRACT, "transport": TRANSPORT, "status": "RUNNING", "job_id": normalized}
        except Exception as exc:  # noqa: BLE001
            return {"success": False, "contract": HTTP_CONTRACT, "transport": TRANSPORT, "status": "FAILED", "job_id": normalized, "error_code": "AVANTIQO_VIDEO_MODAL_GENERATION_FAILED", "error_type": type(exc).__name__[:120], "error_message": _text(exc)[:800]}
        if not isinstance(result, dict):
            return {"success": False, "contract": HTTP_CONTRACT, "transport": TRANSPORT, "status": "FAILED", "job_id": normalized, "error_code": "AVANTIQO_VIDEO_MODAL_OUTPUT_OBJECT_REQUIRED"}
        return {"success": True, "contract": HTTP_CONTRACT, "transport": TRANSPORT, "status": "SUCCEEDED", "job_id": normalized, "output": _safe(result)}

    return web
