"""Authenticated async HTTP transport for the owned Avantiqo Code Modal worker.

This service deliberately uses an application bearer token stored in a Modal
Secret so it works with the installed Modal 1.2.6 client. Proxy-token support
was added to newer Modal clients and remains supported by the application-side
provider for a future migration.

The ASGI function itself holds no GPU. POST /v1/jobs validates authentication
and governance first, then spawns the existing H100 `generate` Function and
returns immediately with a Modal FunctionCall id. GET /v1/jobs/{id} polls it.
"""

from __future__ import annotations

import hmac
import os
from typing import Any

import modal

from modal_app import ENGINE_CONTRACT, PRODUCT_MODEL, app, generate

HTTP_CONTRACT = "AVANTIQO_CODE_MODAL_HTTP_V1"
TRANSPORT = "modal-function-call"
GATEWAY_SECRET_NAME = "avantiqo-code-gateway"
GATEWAY_TOKEN_ENV = "AVANTIQO_CODE_GATEWAY_TOKEN"

api_image = modal.Image.debian_slim(python_version="3.12").pip_install(
    "fastapi[standard]"
)


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
        "reasoning",
        "reasoning_content",
        "chain_of_thought",
        "chainofthought",
        "cot",
        "thoughts",
        "scratchpad",
        "analysis",
    }
    return {
        str(key): _safe(child, depth + 1)
        for key, child in value.items()
        if str(key).lower() not in private
    }


@app.function(
    image=api_image,
    secrets=[modal.Secret.from_name(GATEWAY_SECRET_NAME)],
    timeout=60,
    scaledown_window=5,
    min_containers=0,
    max_containers=4,
)
@modal.asgi_app(requires_proxy_auth=False)
def code_api():
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse

    gateway_token = _text(os.environ.get(GATEWAY_TOKEN_ENV))
    if len(gateway_token) < 40:
        raise RuntimeError("AVANTIQO_CODE_MODAL_GATEWAY_TOKEN_INVALID")
    expected_authorization = f"Bearer {gateway_token}"

    web = FastAPI(title="Avantiqo Code Modal Transport", docs_url=None, redoc_url=None)

    @web.middleware("http")
    async def authenticate(request: Request, call_next):
        supplied = _text(request.headers.get("authorization"))
        if not hmac.compare_digest(supplied, expected_authorization):
            return JSONResponse(
                status_code=401,
                content={
                    "detail": "AVANTIQO_CODE_MODAL_GATEWAY_UNAUTHORIZED",
                    "raw_reasoning_persisted": False,
                },
            )
        return await call_next(request)

    @web.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "success": True,
            "contract": HTTP_CONTRACT,
            "transport": TRANSPORT,
            "engine_contract": ENGINE_CONTRACT,
            "model": PRODUCT_MODEL,
            "gpu_worker": "H100",
            "async_job_queue": True,
            "gateway_auth_required": True,
            "proxy_auth_required": False,
            "persistent_volume_used": False,
            "raw_reasoning_persisted": False,
        }

    @web.post("/v1/jobs")
    async def submit(data: dict[str, Any]) -> dict[str, Any]:
        from fastapi import HTTPException

        if _text(data.get("contract")) != ENGINE_CONTRACT:
            raise HTTPException(status_code=400, detail="AVANTIQO_CODE_ENGINE_CONTRACT_INVALID")
        if not _text(data.get("capability")):
            raise HTTPException(status_code=400, detail="AVANTIQO_CODE_CAPABILITY_REQUIRED")
        if not _text(data.get("organization_id")):
            raise HTTPException(status_code=400, detail="AVANTIQO_CODE_ORGANIZATION_REQUIRED")
        if not _text(data.get("usage_id")):
            raise HTTPException(status_code=400, detail="AVANTIQO_CODE_USAGE_ID_REQUIRED")

        call = await generate.spawn.aio(_safe(data))
        job_id = _text(call.object_id)
        if not job_id:
            raise HTTPException(status_code=500, detail="AVANTIQO_CODE_MODAL_CALL_ID_REQUIRED")
        return {
            "success": True,
            "contract": HTTP_CONTRACT,
            "transport": TRANSPORT,
            "status": "QUEUED",
            "job_id": job_id,
            "engine_contract": ENGINE_CONTRACT,
            "model": PRODUCT_MODEL,
            "proxy_timeout_safe": True,
            "raw_reasoning_persisted": False,
        }

    @web.get("/v1/jobs/{job_id}")
    async def status(job_id: str) -> dict[str, Any]:
        from fastapi import HTTPException

        normalized = _text(job_id)
        if not normalized or len(normalized) > 200:
            raise HTTPException(status_code=400, detail="AVANTIQO_CODE_MODAL_CALL_ID_INVALID")

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
                "proxy_timeout_safe": True,
                "raw_reasoning_persisted": False,
            }
        except modal.exception.OutputExpiredError:
            return {
                "success": False,
                "contract": HTTP_CONTRACT,
                "transport": TRANSPORT,
                "status": "FAILED",
                "job_id": normalized,
                "error_code": "AVANTIQO_CODE_MODAL_OUTPUT_EXPIRED",
                "raw_reasoning_persisted": False,
            }
        except Exception as exc:  # noqa: BLE001 - fail closed with sanitized error only
            return {
                "success": False,
                "contract": HTTP_CONTRACT,
                "transport": TRANSPORT,
                "status": "FAILED",
                "job_id": normalized,
                "error_code": "AVANTIQO_CODE_MODAL_GENERATION_FAILED",
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
                "error_code": "AVANTIQO_CODE_MODAL_OUTPUT_OBJECT_REQUIRED",
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
                "error_code": "AVANTIQO_CODE_MODAL_REASONING_BOUNDARY_INVALID",
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
