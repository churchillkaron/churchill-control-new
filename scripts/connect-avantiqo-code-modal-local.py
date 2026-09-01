#!/usr/bin/env python3
"""Connect the deployed Avantiqo Code Modal transport to local development.

Creates a Modal proxy token through the already-authenticated Modal CLI,
verifies the authenticated /health endpoint, and writes only the required
configuration to the repository .env.local. The token secret is never printed.
No generation endpoint is called, so this script starts no GPU inference.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

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


def _health(base_url: str, token_id: str, token_secret: str) -> dict[str, Any]:
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


def _all_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        values: list[str] = []
        for key, child in value.items():
            values.extend(_all_strings(key))
            values.extend(_all_strings(child))
        return values
    if isinstance(value, list):
        values = []
        for child in value:
            values.extend(_all_strings(child))
        return values
    return []


def _run_modal(modal_cli: str, args: list[str]) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [modal_cli, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=60,
        check=False,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "UNKNOWN").strip()[-1200:]
        raise RuntimeError(f"AVANTIQO_CODE_MODAL_CLI_FAILED:{detail}")
    return result


def _parse_proxy_token_json(raw: str) -> tuple[str, str]:
    candidate = raw.strip()
    try:
        payload = json.loads(candidate)
    except json.JSONDecodeError:
        start_candidates = [position for position in (candidate.find("{"), candidate.find("[")) if position >= 0]
        if not start_candidates:
            raise RuntimeError("AVANTIQO_CODE_MODAL_PROXY_TOKEN_JSON_REQUIRED")
        payload = json.loads(candidate[min(start_candidates):])

    strings = _all_strings(payload)
    token_ids = [value.strip() for value in strings if value.strip().startswith("wk-")]
    token_secrets = [value.strip() for value in strings if value.strip().startswith("ws-")]
    if len(token_ids) != 1 or len(token_secrets) != 1:
        raise RuntimeError("AVANTIQO_CODE_MODAL_PROXY_TOKEN_JSON_INVALID")
    return token_ids[0], token_secrets[0]


def _create_proxy_token(modal_cli: str) -> tuple[str, str]:
    result = _run_modal(
        modal_cli,
        ["workspace", "proxy-tokens", "create", "--json"],
    )
    return _parse_proxy_token_json(result.stdout)


def _allow_proxy_token(modal_cli: str, token_id: str, environment: str) -> None:
    _run_modal(
        modal_cli,
        ["workspace", "proxy-tokens", "allow", token_id, environment],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--environment", default="main")
    args = parser.parse_args()

    repo = Path(args.repo).expanduser().resolve()
    if not (repo / ".git").exists():
        raise RuntimeError("AVANTIQO_CODE_MODAL_REPOSITORY_ROOT_REQUIRED")

    base_url = args.base_url.rstrip("/")
    if not base_url.startswith("https://"):
        raise RuntimeError("AVANTIQO_CODE_MODAL_BASE_URL_HTTPS_REQUIRED")

    modal_cli = shutil.which("modal")
    if not modal_cli:
        raise RuntimeError("AVANTIQO_CODE_MODAL_CLI_REQUIRED")

    token_id, token_secret = _create_proxy_token(modal_cli)
    if not token_id.startswith("wk-") or not token_secret.startswith("ws-"):
        raise RuntimeError("AVANTIQO_CODE_MODAL_PROXY_TOKEN_INVALID")

    try:
        health = _health(base_url, token_id, token_secret)
    except HTTPError as exc:
        if exc.code not in {401, 403}:
            raise
        # RBAC workspaces require explicit environment association.
        _allow_proxy_token(modal_cli, token_id, args.environment)
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
                "environment": args.environment,
                "health_contract": health.get("contract"),
                "gpu_worker": health.get("gpu_worker"),
                "async_job_queue": health.get("async_job_queue"),
                "proxy_auth_verified": True,
                "env_file_updated": str(env_path),
                "proxy_token_id_prefix_valid": token_id.startswith("wk-"),
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
