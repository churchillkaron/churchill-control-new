#!/usr/bin/env python3
"""Connect the deployed Avantiqo Code Modal transport to local development.

Compatible with Modal 1.2.6 / Python 3.9. Generates a strong bearer token,
creates/updates the named Modal Secret from a temporary dotenv file, redeploys
the Modal HTTP wrapper from current origin/main, persists the matching local
configuration, and verifies authenticated /health with cold-start-safe retries.
The bearer token is never printed. No /v1/jobs request is made, so no GPU
inference starts during this connector run.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = (
    "https://churchillkaron--avantiqo-code-real-write-one-shot-code-api.modal.run"
)
HEALTH_CONTRACT = "AVANTIQO_CODE_MODAL_HTTP_V1"
SECRET_NAME = "avantiqo-code-gateway"
SECRET_ENV_KEY = "AVANTIQO_CODE_GATEWAY_TOKEN"
PYTHON_DOTENV_VERSION = "1.0.1"
HEALTH_TIMEOUT_SECONDS = 120
HEALTH_ATTEMPTS = 2
HEALTH_RETRY_DELAY_SECONDS = 8


def _replace_env(path: Path, values: dict[str, str], remove_keys: set[str] | None = None) -> None:
    original = path.read_text(encoding="utf-8") if path.exists() else ""
    lines = original.splitlines()
    keys = set(values)
    removals = set(remove_keys or set())
    output: list[str] = []
    seen: set[str] = set()

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in line:
            output.append(line)
            continue
        key = line.split("=", 1)[0].strip()
        if key in removals:
            continue
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


def _run(command: list[str], cwd: Path | None = None, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "UNKNOWN").strip()[-2000:]
        raise RuntimeError(f"AVANTIQO_CODE_MODAL_COMMAND_FAILED:{command[0]}:{detail}")
    return result


def _ensure_python_dotenv() -> bool:
    """Install only the optional CLI dependency Modal 1.2.6 requires."""
    if importlib.util.find_spec("dotenv") is not None:
        return False

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            f"python-dotenv=={PYTHON_DOTENV_VERSION}",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=180,
        check=False,
        env=os.environ.copy(),
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "UNKNOWN").strip()[-1600:]
        raise RuntimeError(f"AVANTIQO_CODE_MODAL_DOTENV_INSTALL_FAILED:{detail}")

    verification = subprocess.run(
        [sys.executable, "-c", "import dotenv; print('OK')"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=30,
        check=False,
        env=os.environ.copy(),
    )
    if verification.returncode != 0 or verification.stdout.strip() != "OK":
        raise RuntimeError("AVANTIQO_CODE_MODAL_DOTENV_VERIFY_FAILED")
    return True


def _validate_health_body(body: dict[str, Any]) -> dict[str, Any]:
    if body.get("contract") != HEALTH_CONTRACT:
        raise RuntimeError("AVANTIQO_CODE_MODAL_HEALTH_CONTRACT_INVALID")
    if body.get("gateway_auth_required") is not True:
        raise RuntimeError("AVANTIQO_CODE_MODAL_GATEWAY_AUTH_NOT_ENFORCED")
    if body.get("persistent_volume_used") is not False:
        raise RuntimeError("AVANTIQO_CODE_MODAL_UNEXPECTED_PERSISTENT_VOLUME")
    if body.get("raw_reasoning_persisted") is not False:
        raise RuntimeError("AVANTIQO_CODE_MODAL_REASONING_BOUNDARY_INVALID")
    return body


def _health_once(base_url: str, token: str) -> dict[str, Any]:
    request = Request(
        f"{base_url.rstrip('/')}/health",
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urlopen(request, timeout=HEALTH_TIMEOUT_SECONDS) as response:  # noqa: S310 - fixed HTTPS target
        raw = response.read().decode("utf-8")
    return _validate_health_body(json.loads(raw))


def _health(base_url: str, token: str) -> tuple[dict[str, Any], int]:
    last_error: BaseException | None = None
    for attempt in range(1, HEALTH_ATTEMPTS + 1):
        try:
            return _health_once(base_url, token), attempt
        except HTTPError as exc:
            # Authentication/contract failures are deterministic; only transient
            # gateway/service statuses are worth one cold-start retry.
            if exc.code not in {408, 425, 429, 500, 502, 503, 504}:
                raise
            last_error = exc
        except (socket.timeout, TimeoutError, URLError) as exc:
            last_error = exc

        if attempt < HEALTH_ATTEMPTS:
            time.sleep(HEALTH_RETRY_DELAY_SECONDS)

    error_type = type(last_error).__name__ if last_error is not None else "UNKNOWN"
    raise RuntimeError(
        f"AVANTIQO_CODE_MODAL_HEALTH_UNAVAILABLE_AFTER_{HEALTH_ATTEMPTS}_ATTEMPTS:{error_type}"
    ) from last_error


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

    modal_cli = shutil.which("modal")
    git_cli = shutil.which("git")
    if not modal_cli:
        raise RuntimeError("AVANTIQO_CODE_MODAL_CLI_REQUIRED")
    if not git_cli:
        raise RuntimeError("AVANTIQO_CODE_GIT_REQUIRED")

    dotenv_installed = _ensure_python_dotenv()

    gateway_token = secrets.token_urlsafe(48)
    if len(gateway_token) < 40:
        raise RuntimeError("AVANTIQO_CODE_MODAL_GATEWAY_TOKEN_GENERATION_FAILED")

    with tempfile.TemporaryDirectory(prefix="avantiqo-code-modal-connect-") as temp_raw:
        temp = Path(temp_raw)
        secret_env = temp / "gateway.env"
        secret_env.write_text(f"{SECRET_ENV_KEY}={gateway_token}\n", encoding="utf-8")
        os.chmod(secret_env, 0o600)

        _run(
            [
                modal_cli,
                "secret",
                "create",
                SECRET_NAME,
                "--from-dotenv",
                str(secret_env),
                "--force",
            ],
            timeout=60,
        )

        _run([git_cli, "fetch", "origin", "main"], cwd=repo, timeout=60)
        archive = temp / "code-engine.tar"
        with archive.open("wb") as handle:
            archive_result = subprocess.run(
                [
                    git_cli,
                    "archive",
                    "origin/main",
                    "services/avantiqo-code-engine",
                ],
                cwd=str(repo),
                stdout=handle,
                stderr=subprocess.PIPE,
                timeout=60,
                check=False,
            )
        if archive_result.returncode != 0:
            detail = archive_result.stderr.decode("utf-8", errors="replace")[-1200:]
            raise RuntimeError(f"AVANTIQO_CODE_MODAL_ARCHIVE_FAILED:{detail}")
        _run(["tar", "-xf", str(archive), "-C", str(temp)], timeout=60)

        engine_dir = temp / "services" / "avantiqo-code-engine"
        _run([modal_cli, "deploy", "modal_service.py"], cwd=engine_dir, timeout=1800)

    # Persist the exact credential pair that was just installed in Modal before
    # probing the newly deployed cold web function. A health timeout must not
    # orphan the only local copy and force another secret rotation/deploy.
    env_path = repo / ".env.local"
    _replace_env(
        env_path,
        {
            "AVANTIQO_CODE_ENGINE_ENABLED": "true",
            "AVANTIQO_CODE_MODAL_BASE_URL": base_url,
            "AVANTIQO_CODE_MODAL_GATEWAY_TOKEN": gateway_token,
            "AVANTIQO_CODE_MODAL_HTTP_TIMEOUT_MS": "30000",
        },
        remove_keys={
            "AVANTIQO_CODE_MODAL_PROXY_TOKEN_ID",
            "AVANTIQO_CODE_MODAL_PROXY_TOKEN_SECRET",
        },
    )

    health, health_attempts_used = _health(base_url, gateway_token)

    print(
        json.dumps(
            {
                "success": True,
                "contract": "AVANTIQO_CODE_MODAL_LOCAL_CONNECT_V2",
                "modal_client_compatible": "1.2.6+",
                "authentication": "BEARER_GATEWAY_V1",
                "python_dotenv_installed_by_connector": dotenv_installed,
                "python_dotenv_version": PYTHON_DOTENV_VERSION,
                "health_contract": health.get("contract"),
                "health_attempts_used": health_attempts_used,
                "health_timeout_seconds_per_attempt": HEALTH_TIMEOUT_SECONDS,
                "gpu_worker": health.get("gpu_worker"),
                "async_job_queue": health.get("async_job_queue"),
                "gateway_auth_verified": True,
                "env_file_updated": str(env_path),
                "gateway_token_printed": False,
                "gpu_inference_performed": False,
                "runpod_mutation_performed": False,
                "production_deploy_performed": False,
            },
            separators=(",", ":"),
        )
    )
    print("AVANTIQO_CODE_MODAL_LOCAL_CONNECT_V2=PASS")


if __name__ == "__main__":
    main()
