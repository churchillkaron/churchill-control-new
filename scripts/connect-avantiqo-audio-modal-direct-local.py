#!/usr/bin/env python3
"""Connect Avantiqo Audio control directly to the deployed Modal GPU function.

This is a configuration-only local cutover. It reuses the already-authenticated
Modal profile, writes its token pair to the repository-local .env.local with
0600 permissions, and enables Audio's direct SDK lane. It does not deploy a
Modal app, build an image, start a GPU, submit inference, mutate RunPod, or
deploy Vercel production.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_AUDIO_MODAL_DIRECT_CUTOVER_V1"
APP_NAME = "avantiqo-audio-owned"
FUNCTION_NAME = "generate"
TRANSPORT = "modal-js-sdk-function-call-v1"


def text(value: Any) -> str:
    return str(value or "").strip()


def replace_env(path: Path, values: dict[str, str]) -> None:
    original = path.read_text(encoding="utf-8") if path.exists() else ""
    lines = original.splitlines()
    keys = set(values)
    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        if "=" not in line or line.lstrip().startswith("#"):
            output.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key not in keys:
            output.append(line)
            continue
        if key in seen:
            continue
        output.append(f"{key}={values[key]}")
        seen.add(key)
    if output and output[-1] != "":
        output.append("")
    for key, value in values.items():
        if key not in seen:
            output.append(f"{key}={value}")
    path.write_text("\n".join(output).rstrip() + "\n", encoding="utf-8")
    os.chmod(path, 0o600)


def main() -> None:
    repo = Path.cwd().resolve()
    if not (repo / ".git").exists():
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_DIRECT_RUN_FROM_REPOSITORY_ROOT_REQUIRED")

    try:
        from modal.config import config
    except Exception as exc:
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_DIRECT_MODAL_SDK_REQUIRED") from exc

    token_id = text(config.get("token_id"))
    token_secret = text(config.get("token_secret"))
    environment = text(config.get("environment"))
    if not token_id or not token_secret:
        raise RuntimeError("AVANTIQO_AUDIO_MODAL_DIRECT_AUTHENTICATED_PROFILE_REQUIRED")

    env_path = repo / ".env.local"
    values = {
        "MODAL_TOKEN_ID": token_id,
        "MODAL_TOKEN_SECRET": token_secret,
        "AVANTIQO_AUDIO_ENGINE_ENABLED": "true",
        "AVANTIQO_AUDIO_ENGINE_TIMEOUT_MS": "30000",
        "AVANTIQO_AUDIO_MODAL_TRANSPORT": TRANSPORT,
        "AVANTIQO_AUDIO_MODAL_APP_NAME": APP_NAME,
        "AVANTIQO_AUDIO_MODAL_FUNCTION_NAME": FUNCTION_NAME,
    }
    if environment:
        values["AVANTIQO_MODAL_ENVIRONMENT"] = environment
    replace_env(env_path, values)

    print(json.dumps({
        "success": True,
        "contract": CONTRACT,
        "transport": TRANSPORT,
        "modal_app": APP_NAME,
        "modal_function": FUNCTION_NAME,
        "modal_environment_configured": bool(environment),
        "modal_token_id_configured": True,
        "modal_token_secret_configured": True,
        "modal_credentials_printed": False,
        "env_file_mode": "0600",
        "gateway_required": False,
        "gateway_deployed": False,
        "worker_deployed": False,
        "image_build_performed": False,
        "gpu_requested": False,
        "gpu_inference_performed": False,
        "runpod_mutation_performed": False,
        "production_vercel_deploy_performed": False,
    }, separators=(",", ":")), flush=True)
    print(f"{CONTRACT}=PASS", flush=True)


if __name__ == "__main__":
    main()
