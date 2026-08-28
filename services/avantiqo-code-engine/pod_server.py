import asyncio
import hmac
import json
import os
import time
import traceback
from typing import Any
from uuid import uuid4

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

CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3"
HOST = "0.0.0.0"
PORT = int(os.getenv("AVANTIQO_CODE_POD_PORT", "8000"))
POD_TOKEN = os.getenv("AVANTIQO_CODE_POD_TOKEN", "").strip()
MAX_CONCURRENCY = 1
JOB_HISTORY_LIMIT = 32
TERMINAL_JOB_STATES = {"SUCCEEDED", "FAILED"}
TRANSPORT_PROBE_PATH = "/v3/transport-probe"
ASYNC_SUBMIT_PATH = "/v3/generations"
ASYNC_STATUS_PATH_TEMPLATE = "/v3/generations/{job_id}"
LEGACY_ASYNC_SUBMIT_PATH = "/jobs"
LEGACY_ASYNC_STATUS_PATH_TEMPLATE = "/jobs/{job_id}"

if len(POD_TOKEN) < 32:
    raise RuntimeError("AVANTIQO_CODE_POD_TOKEN_REQUIRED_MIN_32_CHARS")

app = FastAPI(
    title="Avantiqo Code Pod",
    version="3",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
_request_gate = asyncio.Semaphore(MAX_CONCURRENCY)
_jobs_lock = asyncio.Lock()
_jobs: dict[str, dict[str, Any]] = {}
_job_tasks: set[asyncio.Task[Any]] = set()


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


def _job_public(job: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "success": True,
        "contract": CONTRACT,
        "transport": "pod-http",
        "job_id": job["job_id"],
        "status": job["status"],
        "created_at": job["created_at"],
        "started_at": job.get("started_at"),
        "completed_at": job.get("completed_at"),
        "raw_reasoning_persisted": False,
    }
    if job.get("output") is not None:
        payload["output"] = job["output"]
    if job.get("error_type"):
        payload["error_type"] = job["error_type"]
        payload["error_message"] = job.get("error_message")
    return payload


async def _prune_jobs_locked() -> None:
    if len(_jobs) <= JOB_HISTORY_LIMIT:
        return
    completed = sorted(
        (
            item
            for item in _jobs.values()
            if item.get("status") in TERMINAL_JOB_STATES
        ),
        key=lambda item: float(item.get("completed_at") or item.get("created_at") or 0),
    )
    while len(_jobs) > JOB_HISTORY_LIMIT and completed:
        stale = completed.pop(0)
        _jobs.pop(stale["job_id"], None)


def _engine_warmup_requested(engine_job: dict[str, Any]) -> bool:
    data = engine_job.get("input") or {}
    specification = data.get("structured_specification") or {}
    return (
        specification.get("infrastructure_warmup") is True
        and specification.get("customer_work") is False
        and _text(data.get("organization_id")) == "benchmark-only"
    )


def _engine_warmup_output(engine_job: dict[str, Any]) -> dict[str, Any]:
    code_engine._validate_runtime_contract()
    code_engine._load_engine()
    data = engine_job.get("input") or {}
    return {
        "status": "engine_ready",
        "provider": "avantiqo-code",
        "model": code_engine.PRODUCT_MODEL,
        "engine_contract": code_engine.ENGINE_CONTRACT,
        "capability": _text(data.get("capability")),
        "foundation_model": code_engine.FOUNDATION_MODEL,
        "runtime_model": code_engine.RUNTIME_MODEL,
        "serving_runtime": "vllm",
        "quantization": code_engine.QUANTIZATION,
        "engine_loaded": code_engine._ENGINE is not None,
        "inference_performed": False,
        "generation_performed": False,
        "customer_work": False,
        "reasoning_call_consumed": False,
        "wallet_mutation_performed": False,
        "raw_reasoning_persisted": False,
    }


async def _execute_async_job(job_id: str, engine_job: dict[str, Any]) -> None:
    async with _request_gate:
        async with _jobs_lock:
            current = _jobs.get(job_id)
            if current is None:
                return
            current["status"] = "RUNNING"
            current["started_at"] = time.time()
        try:
            if _engine_warmup_requested(engine_job):
                output = await asyncio.to_thread(_engine_warmup_output, engine_job)
            else:
                output = await asyncio.to_thread(code_engine.handler, engine_job)
        except Exception as error:
            traceback.print_exc()
            async with _jobs_lock:
                current = _jobs.get(job_id)
                if current is not None:
                    current["status"] = "FAILED"
                    current["completed_at"] = time.time()
                    current["error_type"] = type(error).__name__
                    current["error_message"] = _text(error)[:800]
                    await _prune_jobs_locked()
            return

        async with _jobs_lock:
            current = _jobs.get(job_id)
            if current is None:
                return
            current["status"] = "SUCCEEDED"
            current["completed_at"] = time.time()
            current["output"] = output
            await _prune_jobs_locked()


def _track_task(task: asyncio.Task[Any]) -> None:
    _job_tasks.add(task)
    task.add_done_callback(_job_tasks.discard)


@app.get("/health")
async def health() -> dict[str, Any]:
    code_engine.check_worker()
    cached_path = code_engine._cached_model_path(code_engine.RUNTIME_MODEL)
    async with _jobs_lock:
        statuses = [item.get("status") for item in _jobs.values()]
    return {
        "success": True,
        "contract": CONTRACT,
        "provider": "avantiqo-code",
        "engine_contract": code_engine.ENGINE_CONTRACT,
        "transport": "pod-http",
        "transport_mode": "async-job-polling",
        "transport_probe_path": TRANSPORT_PROBE_PATH,
        "async_submit_path": ASYNC_SUBMIT_PATH,
        "async_status_path_template": ASYNC_STATUS_PATH_TEMPLATE,
        "runtime_model": code_engine.RUNTIME_MODEL,
        "foundation_model": code_engine.FOUNDATION_MODEL,
        "quantization": code_engine.QUANTIZATION,
        "cached_model_found": bool(cached_path),
        "engine_loaded": code_engine._ENGINE is not None,
        "max_concurrency": MAX_CONCURRENCY,
        "async_jobs_enabled": True,
        "synchronous_generation_allowed": False,
        "jobs_queued": statuses.count("QUEUED"),
        "jobs_running": statuses.count("RUNNING"),
        "raw_reasoning_persisted": False,
    }


@app.post(TRANSPORT_PROBE_PATH)
async def transport_probe(
    authorization: str | None = Header(default=None),
):
    _authorize(authorization)
    return {
        "success": True,
        "contract": CONTRACT,
        "transport": "pod-http",
        "transport_mode": "async-job-polling",
        "proxy_timeout_safe": True,
        "inference_performed": False,
        "raw_reasoning_persisted": False,
    }


async def _create_generation(
    payload: dict[str, Any],
    authorization: str | None,
):
    _authorize(authorization)
    if not isinstance(payload, dict) or not isinstance(payload.get("input"), dict):
        raise HTTPException(status_code=400, detail="AVANTIQO_CODE_POD_INPUT_REQUIRED")

    requested_id = _text(payload.get("id"))
    if len(requested_id) > 160:
        raise HTTPException(status_code=400, detail="AVANTIQO_CODE_POD_JOB_ID_TOO_LONG")
    job_id = requested_id or f"pod-http-{uuid4().hex}"
    now = time.time()

    async with _jobs_lock:
        if job_id in _jobs:
            raise HTTPException(status_code=409, detail="AVANTIQO_CODE_POD_JOB_ID_CONFLICT")
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "QUEUED",
            "created_at": now,
            "started_at": None,
            "completed_at": None,
            "output": None,
            "error_type": None,
            "error_message": None,
        }
        await _prune_jobs_locked()

    engine_job = {
        "id": job_id,
        "input": payload["input"],
    }
    task = asyncio.create_task(_execute_async_job(job_id, engine_job))
    _track_task(task)

    return JSONResponse(
        status_code=202,
        content={
            "success": True,
            "contract": CONTRACT,
            "transport": "pod-http",
            "transport_mode": "async-job-polling",
            "job_id": job_id,
            "status": "QUEUED",
            "poll_path": ASYNC_STATUS_PATH_TEMPLATE.replace("{job_id}", job_id),
            "proxy_timeout_safe": True,
            "raw_reasoning_persisted": False,
        },
    )


@app.post(ASYNC_SUBMIT_PATH)
async def create_generation(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
):
    return await _create_generation(payload, authorization)


# Backward-compatible alias. The V3 transport advertises and certifies only the
# versioned canonical route so external proxy behavior cannot be confused with
# application routing.
@app.post(LEGACY_ASYNC_SUBMIT_PATH, include_in_schema=False)
async def create_generation_legacy(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
):
    return await _create_generation(payload, authorization)


async def _get_generation(job_id: str, authorization: str | None):
    _authorize(authorization)
    normalized = _text(job_id)
    async with _jobs_lock:
        job = _jobs.get(normalized)
        if job is None:
            raise HTTPException(status_code=404, detail="AVANTIQO_CODE_POD_JOB_NOT_FOUND")
        return _job_public(job)


@app.get(ASYNC_STATUS_PATH_TEMPLATE)
async def get_generation(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    return await _get_generation(job_id, authorization)


@app.get(LEGACY_ASYNC_STATUS_PATH_TEMPLATE, include_in_schema=False)
async def get_generation_legacy(
    job_id: str,
    authorization: str | None = Header(default=None),
):
    return await _get_generation(job_id, authorization)


@app.post("/run")
async def run(
    payload: dict[str, Any],
    authorization: str | None = Header(default=None),
):
    _authorize(authorization)
    if not isinstance(payload, dict) or not isinstance(payload.get("input"), dict):
        raise HTTPException(status_code=400, detail="AVANTIQO_CODE_POD_INPUT_REQUIRED")

    specification = payload["input"].get("structured_specification") or {}
    short_control_request = (
        specification.get("runtime_probe") is True
        or specification.get("cache_runtime_model") is True
    )
    if not short_control_request:
        return JSONResponse(
            status_code=409,
            content={
                "success": False,
                "contract": CONTRACT,
                "transport": "pod-http",
                "error_type": "AsyncJobRequired",
                "error_message": "AVANTIQO_CODE_POD_ASYNC_JOB_REQUIRED",
                "transport_probe_path": TRANSPORT_PROBE_PATH,
                "async_submit_path": ASYNC_SUBMIT_PATH,
                "async_status_path_template": ASYNC_STATUS_PATH_TEMPLATE,
                "raw_reasoning_persisted": False,
            },
        )

    job = {
        "id": _text(payload.get("id")) or "pod-http-control",
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
                "model_load": "LAZY_ASYNC_ENGINE_WARMUP",
                "transport_mode": "async-job-polling",
                "transport_probe_path": TRANSPORT_PROBE_PATH,
                "async_submit_path": ASYNC_SUBMIT_PATH,
                "async_status_path_template": ASYNC_STATUS_PATH_TEMPLATE,
                "engine_warmup_generation_performed": False,
                "synchronous_generation_allowed": False,
                "secrets_printed": False,
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    uvicorn.run(app, host=HOST, port=PORT, workers=1, log_level="info")
