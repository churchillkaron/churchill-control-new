#!/usr/bin/env python3
"""Connect the deployed Avantiqo Code Modal transport to local development.

Creates a Modal proxy token using the already-authenticated Modal workspace,
verifies the authenticated /health endpoint, and writes only the required
configuration to the repository .env.local. The token secret is never printed.
No generation endpoint is called, so this script starts no GPU inference.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import modal

DEFAULT_BASE_URL = (
    "https://churchillkaron--avantiqo-code-real-write-one-shot-code-api.modal.run"
)
HEALTH_CONTRACT = "AVANTIQO_CODE_MODAL_HTTP_V1"


def _replace_env(path: Path, values: dict[str, str]) -> None:
    original = path.read_text(encoding="utf-8") if path.exists() else ""
    lines = original.splitlines()
    keys = set(values)
    output: list[str] = []
    seen: set[str] = set()

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
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


def _health(base_url: str, token_id: str, token_secret: str) -> dict:
    request = Request(
        f"{base_url.rstrip('/')}/health",
        headers={
            "Accept": "application/json",
            "Modal-Key": token_id,
            "Modal-Secret": token_secret,
        },
    )
    with urlopen(request, timeout=30) as response:  # noqa: S310 - fixed HTTPS target
        raw = response.read().decode("utf-8")
    body = json.loads(raw)
    if body.get("contract") != HEALTH_CONTRACT:
        raise RuntimeError("AVANTIQO_CODE_MODAL_HEALTH_CONTRACT_INVALID")
    if body.get("proxy_auth_required") is not True:
        raise RuntimeError("AVANTIQO_CODE_MODAL_PROXY_AUTH_NOT_ENFORCED")
    if body.get("persistent_volume_used") is not False:
        raise RuntimeError("AVANTIQO_CODE_MODAL_UNEXPECTED_PERSISTENT_VOLUME")
    if body.get("raw_reasoning_persisted") is not False:
        raise RuntimeError("AVANTIQO_CODE_MODAL_REASONING_BOUNDARY_INVALID")
    return body


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    args = parser.parse_args()

    repo = Path(args.repo).expanduser().resolve()
    if not (repo / ".git").exists():
        raise RuntimeError("AVANTIQO_CODE_MODAL_REPOSITORY_ROOT_REQUIRED")

    base_url = args.base_url.rstrip("/")
    if not base_url.startswith("https://"):
        raise RuntimeError("AVANTIQO_CODE_MODAL_BASE_URL_HTTPS_REQUIRED")

    workspace = modal.Workspace.from_context()
    token = workspace.proxy_tokens.create()
    token_id = str(token.token_id)
    token_secret = str(token.token_secret)
    if not token_id.startswith("wk-") or not token_secret.startswith("ws-"):
        raise RuntimeError("AVANTIQO_CODE_MODAL_PROXY_TOKEN_INVALID")

    try:
        health = _health(base_url, token_id, token_secret)
    except HTTPError as exc:
        if exc.code != 401:
            raise
        # RBAC workspaces require explicit environment association.
        workspace.proxy_tokens.allow(token_id, "main")
        health = _health(base_url, token_id, token_secret)

    env_path = repo / ".env.local"
    _replace_env(
        env_path,
        {
            "AVANTIQO_CODE_ENGINE_ENABLED": "true",
            "AVANTIQO_CODE_MODAL_BASE_URL": base_url,
            "AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID": token_id,
            "AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET": token_secret,
            "AVANTIQO_CODE_MODAL_HTTP_TIMEOUT_MS": "30000",
        },
    )

    print(
        json.dumps(
            {
                "success": True,
                "contract": "AVANTIQO_CODE_MODAL_LOCAL_CONNECT_V1",
                "workspace": "authenticated-current-workspace",
                "health_contract": health.get("contract"),
                "gpu_worker": health.get("gpu_worker"),
                "async_job_queue": health.get("async_job_queue"),
                "proxy_auth_verified": True,
                "env_file_updated": str(env_path),
                "proxy_token_secret_printed": False,
                "gpu_inference_performed": False,
                "production_deploy_performed": False,
            },
            separators=(",", ":"),
        )
    )
    print("AVANTIQO_CODE_MODAL_LOCAL_CONNECT_V1=PASS")


if __name__ == "__main__":
    main()
