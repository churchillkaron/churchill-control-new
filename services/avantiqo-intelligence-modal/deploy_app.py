"""Governed deployment entrypoint for owned Avantiqo Intelligence.

Imports the Fast/Deep GPU functions from modal_app.py and adds a zero-GPU
provenance function whose Modal name contains the exact worker-source
fingerprint. Certification can therefore prove deployment freshness through a
metadata lookup without executing any remote function or starting an H100.
"""
from __future__ import annotations

import os

import modal

from modal_app import (
    APP_NAME,
    DEEP_MODEL,
    DEEP_SCALEDOWN_WINDOW_SECONDS,
    FAST_MODEL,
    FAST_SCALEDOWN_WINDOW_SECONDS,
    GPU,
    app,
)

RUNTIME_PROBE_SCHEMA = "AVANTIQO_INTELLIGENCE_MODAL_RUNTIME_PROBE_V2"
DEPLOY_GIT_SHA = os.environ.get("AVANTIQO_INTELLIGENCE_DEPLOY_GIT_SHA", "").strip() or "UNSET"
DEPLOY_SOURCE_FINGERPRINT = (
    os.environ.get("AVANTIQO_INTELLIGENCE_DEPLOY_SOURCE_FINGERPRINT", "").strip() or "UNSET"
)
RUNTIME_PROBE_FUNCTION_NAME = f"runtime_probe_{DEPLOY_SOURCE_FINGERPRINT[:16]}"

probe_image = modal.Image.debian_slim(python_version="3.12").env({
    "AVANTIQO_INTELLIGENCE_RUNTIME_PROBE_SCHEMA": RUNTIME_PROBE_SCHEMA,
    "AVANTIQO_INTELLIGENCE_DEPLOY_GIT_SHA": DEPLOY_GIT_SHA,
    "AVANTIQO_INTELLIGENCE_DEPLOY_SOURCE_FINGERPRINT": DEPLOY_SOURCE_FINGERPRINT,
    "AVANTIQO_INTELLIGENCE_APP_NAME": APP_NAME,
    "AVANTIQO_INTELLIGENCE_FAST_MODEL": FAST_MODEL,
    "AVANTIQO_INTELLIGENCE_DEEP_MODEL": DEEP_MODEL,
    "AVANTIQO_INTELLIGENCE_GPU": GPU,
    "AVANTIQO_INTELLIGENCE_FAST_SCALEDOWN_SECONDS": str(FAST_SCALEDOWN_WINDOW_SECONDS),
    "AVANTIQO_INTELLIGENCE_DEEP_SCALEDOWN_SECONDS": str(DEEP_SCALEDOWN_WINDOW_SECONDS),
})


@app.function(
    name=RUNTIME_PROBE_FUNCTION_NAME,
    image=probe_image,
    timeout=60,
    min_containers=0,
    max_containers=1,
    buffer_containers=0,
    scaledown_window=5,
)
def runtime_probe() -> dict[str, object]:
    """Optional diagnostic payload; deployment proof does not invoke this."""
    return {
        "schema": os.environ.get("AVANTIQO_INTELLIGENCE_RUNTIME_PROBE_SCHEMA", ""),
        "app_name": os.environ.get("AVANTIQO_INTELLIGENCE_APP_NAME", ""),
        "deploy_git_sha": os.environ.get("AVANTIQO_INTELLIGENCE_DEPLOY_GIT_SHA", ""),
        "source_fingerprint": os.environ.get("AVANTIQO_INTELLIGENCE_DEPLOY_SOURCE_FINGERPRINT", ""),
        "fast_model": os.environ.get("AVANTIQO_INTELLIGENCE_FAST_MODEL", ""),
        "deep_model": os.environ.get("AVANTIQO_INTELLIGENCE_DEEP_MODEL", ""),
        "gpu": os.environ.get("AVANTIQO_INTELLIGENCE_GPU", ""),
        "fast_scaledown_seconds": int(os.environ.get("AVANTIQO_INTELLIGENCE_FAST_SCALEDOWN_SECONDS", "0") or 0),
        "deep_scaledown_seconds": int(os.environ.get("AVANTIQO_INTELLIGENCE_DEEP_SCALEDOWN_SECONDS", "0") or 0),
        "fast_cuda_graphs": True,
        "fast_safetensors_prefetch": True,
        "gpu_inference_performed": False,
        "secrets_exposed": False,
    }
