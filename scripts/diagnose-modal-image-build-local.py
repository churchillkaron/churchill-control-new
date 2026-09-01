#!/usr/bin/env python3
"""Read an existing Modal image build's logs without rebuilding or running it.

Compatible with the repository's pinned local Modal 1.2.6 environment. That
client predates the public ``modal image logs`` command, but already exposes the
ImageJoinStreaming control-plane RPC used by Modal's own image resolver.

This script performs no deploy, image build, Function invocation, GPU request,
Volume mutation, RunPod mutation, Vercel deployment, or application mutation.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
from typing import Any

from modal.client import _Client
from modal_proto import api_pb2

CONTRACT = "AVANTIQO_MODAL_IMAGE_BUILD_DIAGNOSTIC_V1"
IMAGE_ID_RE = re.compile(r"^im-[A-Za-z0-9]+$")
SENSITIVE_RE = re.compile(
    r"(?i)(authorization\s*[:=]|bearer\s+[A-Za-z0-9._~+/=-]+|"
    r"token[_-]?(?:id|secret)?\s*[:=]|secret\s*[:=])"
)


def _text(value: Any, limit: int = 20000) -> str:
    return str(value or "").strip()[:limit]


def _safe_log(value: Any) -> str:
    text = str(value or "")
    if not text:
        return ""
    output: list[str] = []
    for line in text.splitlines():
        if SENSITIVE_RE.search(line):
            output.append("[REDACTED_SENSITIVE_BUILD_LOG_LINE]")
        else:
            output.append(line)
    return "\n".join(output)


async def _read_image(image_id: str) -> dict[str, Any]:
    client = await _Client.from_env()
    last_entry_id = ""
    result = None
    log_lines = 0
    try:
        # A completed/failed image normally resolves in one stream. Keep a
        # bounded second pass only for a transient stream boundary.
        for _attempt in range(2):
            request = api_pb2.ImageJoinStreamingRequest(
                image_id=image_id,
                timeout=55,
                last_entry_id=last_entry_id,
            )
            async for response in client.stub.ImageJoinStreaming.unary_stream(request):
                if response.entry_id:
                    last_entry_id = response.entry_id
                for task_log in response.task_logs:
                    line = _safe_log(task_log.data)
                    if line:
                        print(line, flush=True)
                        log_lines += len(line.splitlines())
                if response.result.status:
                    result = response.result
            if result is not None:
                break
    finally:
        await client._close()

    if result is None:
        raise RuntimeError("AVANTIQO_MODAL_IMAGE_BUILD_RESULT_UNAVAILABLE")

    status_name = "UNKNOWN"
    try:
        status_name = api_pb2.GenericResult.Status.Name(result.status)
    except Exception:
        status_name = str(result.status)

    exception = _safe_log(getattr(result, "exception", ""))
    traceback = _safe_log(getattr(result, "traceback", ""))
    if exception:
        print(f"AVANTIQO_MODAL_IMAGE_BUILD_EXCEPTION={exception}", flush=True)
    if traceback:
        print("AVANTIQO_MODAL_IMAGE_BUILD_TRACEBACK_BEGIN", flush=True)
        print(traceback, flush=True)
        print("AVANTIQO_MODAL_IMAGE_BUILD_TRACEBACK_END", flush=True)

    return {
        "success": True,
        "contract": CONTRACT,
        "image_id": image_id,
        "build_status": status_name,
        "build_exception_present": bool(exception),
        "build_traceback_present": bool(traceback),
        "build_log_lines_printed": log_lines,
        "deployment_performed": False,
        "image_build_performed": False,
        "model_download_performed": False,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "modal_volume_mutation_performed": False,
        "runpod_mutation_performed": False,
        "production_vercel_deploy_performed": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image_id")
    args = parser.parse_args()
    image_id = _text(args.image_id, 128)
    if not IMAGE_ID_RE.fullmatch(image_id):
        raise RuntimeError("AVANTIQO_MODAL_IMAGE_ID_INVALID")
    report = asyncio.run(_read_image(image_id))
    print(json.dumps(report, separators=(",", ":")), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)


if __name__ == "__main__":
    main()
