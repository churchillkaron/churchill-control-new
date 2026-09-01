#!/usr/bin/env python3
"""Safely connect remaining Avantiqo-owned engines to Modal.

Voice can be deployed without model seeding because its certified images already
contain Whisper/Chatterbox. Intelligence and Audio require first-time immutable
Modal image-layer model bakes; those are skipped unless their explicit approval
environment variables equal YES.

The Audio worker image is private in GHCR. Before any Modal image build this
connector proves the exact immutable digest is pullable with the already-authorized
local GitHub CLI credential. The credential is then passed only to the worker
deploy subprocess so Modal can create an ephemeral registry Secret for
Image.from_registry. It is never printed, written to .env.local, attached to the
runtime function, or persisted as a named Modal application secret.

This connector never submits inference, never mutates RunPod, and never deploys
Vercel production.
"""
from __future__ import annotations

import base64
import json
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

WORKSPACE = "churchillkaron"
CONTRACT = "AVANTIQO_OWNED_MODAL_CUTOVER_V3"
MODAL_URL_RE = re.compile(r"https://[A-Za-z0-9.-]+\.modal\.run")
HEALTH_TIMEOUT_SECONDS = 120
HEALTH_ATTEMPTS = 2
HEALTH_RETRY_SECONDS = 5
AUDIO_GHCR_REPOSITORY = "churchillkaron/avantiqo-audio-worker"
AUDIO_GHCR_DIGEST = "sha256:fe148b123a7c8ce95c639a22abf8f0e918cba5f0e28f71bc4e3fe254c893b56b"

ENGINES = {
    "voice": {
        "source_dir": "services/avantiqo-voice-modal",
        "secret_name": "avantiqo-voice-gateway",
        "secret_env": "AVANTIQO_VOICE_GATEWAY_TOKEN",
        "base_env": "AVANTIQO_VOICE_MODAL_BASE_URL",
        "token_env": "AVANTIQO_VOICE_MODAL_GATEWAY_TOKEN",
        "enabled_env": "AVANTIQO_VOICE_ENGINE_ENABLED",
        "timeout_env": "AVANTIQO_VOICE_MODAL_HTTP_TIMEOUT_MS",
        "health_contract": "AVANTIQO_VOICE_MODAL_HTTP_V1",
        "expected_gpu": "A10G",
        "approval_env": None,
        "model_bake_required": False,
        "expected_functions": {"transcribe", "speak"},
    },
    "intelligence": {
        "source_dir": "services/avantiqo-intelligence-modal",
        "secret_name": "avantiqo-intelligence-gateway",
        "secret_env": "AVANTIQO_INTELLIGENCE_GATEWAY_TOKEN",
        "base_env": "AVANTIQO_INTELLIGENCE_MODAL_BASE_URL",
        "token_env": "AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN",
        "enabled_env": "AVANTIQO_INTELLIGENCE_ENGINE_ENABLED",
        "timeout_env": "AVANTIQO_INTELLIGENCE_MODAL_HTTP_TIMEOUT_MS",
        "health_contract": "AVANTIQO_INTELLIGENCE_MODAL_HTTP_V1",
        "expected_gpu": "H100",
        "approval_env": "AVANTIQO_INTELLIGENCE_MODAL_MODEL_BAKE_APPROVED",
        "model_bake_required": True,
        "expected_functions": {"fast", "deep"},
    },
    "audio": {
        "source_dir": "services/avantiqo-audio-modal",
        "secret_name": "avantiqo-audio-gateway",
        "secret_env": "AVANTIQO_AUDIO_GATEWAY_TOKEN",
        "base_env": "AVANTIQO_AUDIO_MODAL_BASE_URL",
        "token_env": "AVANTIQO_AUDIO_MODAL_GATEWAY_TOKEN",
        "enabled_env": "AVANTIQO_AUDIO_ENGINE_ENABLED",
        "timeout_env": "AVANTIQO_AUDIO_ENGINE_TIMEOUT_MS",
        "health_contract": "AVANTIQO_AUDIO_MODAL_HTTP_V1",
        "expected_gpu": "A10G",
        "approval_env": "AVANTIQO_AUDIO_MODAL_MODEL_BAKE_APPROVED",
        "model_bake_required": True,
        "expected_functions": {"generate"},
    },
}


def text(value: Any) -> str:
    return str(value or "").strip()


def approved(name: str | None) -> bool:
    return bool(name and text(os.environ.get(name)).upper() == "YES")


def run(
    command: list[str],
    *,
    cwd: Path | None = None,
    timeout: int = 7200,
    env_updates: dict[str, str] | None = None,
    secret_command: bool = False,
) -> subprocess.CompletedProcess[str]:
    process_env = os.environ.copy()
    if env_updates:
        process_env.update(env_updates)
    result = subprocess.run(
        command,
        cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
        check=False,
        env=process_env,
    )
    if result.returncode != 0:
        # Preserve both streams because Modal frequently places the useful build
        # diagnostic in stdout while the final wrapper error lands in stderr.
        combined = "\n".join(part for part in (result.stdout, result.stderr) if part).strip()
        detail = combined[-12000:] if combined else "UNKNOWN"
        command_label = command[0] if secret_command else " ".join(command[:3])
        raise RuntimeError(f"AVANTIQO_OWNED_MODAL_COMMAND_FAILED:{command_label}:{detail}")
    return result


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


def env_value(path: Path, key: str) -> str:
    if not path.exists():
        return ""
    pattern = re.compile(rf"^{re.escape(key)}=(.*)$")
    for line in path.read_text(encoding="utf-8").splitlines():
        match = pattern.match(line.strip())
        if match:
            return match.group(1).strip()
    return ""


def voice_already_connected(env_path: Path) -> bool:
    return bool(
        env_value(env_path, "AVANTIQO_VOICE_ENGINE_ENABLED").lower() == "true"
        and env_value(env_path, "AVANTIQO_VOICE_MODAL_BASE_URL").startswith("https://")
        and len(env_value(env_path, "AVANTIQO_VOICE_MODAL_GATEWAY_TOKEN")) >= 40
    )


def create_secret(modal_cli: str, *, name: str, key: str, value: str, temp: Path) -> None:
    secret_file = temp / f"{name}.env"
    secret_file.write_text(f"{key}={value}\n", encoding="utf-8")
    os.chmod(secret_file, 0o600)
    run(
        [modal_cli, "secret", "create", name, "--from-dotenv", str(secret_file), "--force"],
        timeout=120,
        secret_command=True,
    )


def gh_value(gh_cli: str, args: list[str], error_code: str) -> str:
    result = subprocess.run(
        [gh_cli, *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=60,
        check=False,
        env=os.environ.copy(),
    )
    value = text(result.stdout)
    if result.returncode != 0 or not value:
        raise RuntimeError(error_code)
    return value


def prove_audio_ghcr_pull(gh_cli: str) -> tuple[str, str]:
    username = gh_value(gh_cli, ["api", "user", "--jq", ".login"], "AVANTIQO_LOCAL_GH_LOGIN_REQUIRED")
    github_token = gh_value(gh_cli, ["auth", "token", "-h", "github.com"], "AVANTIQO_LOCAL_GH_TOKEN_REQUIRED")

    basic = base64.b64encode(f"{username}:{github_token}".encode("utf-8")).decode("ascii")
    token_query = urlencode({
        "service": "ghcr.io",
        "scope": f"repository:{AUDIO_GHCR_REPOSITORY}:pull",
    })
    token_request = Request(
        f"https://ghcr.io/token?{token_query}",
        headers={"Authorization": f"Basic {basic}", "Accept": "application/json"},
    )
    try:
        with urlopen(token_request, timeout=30) as response:
            token_body = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, OSError, ValueError) as exc:
        raise RuntimeError("AVANTIQO_AUDIO_GHCR_PULL_TOKEN_PROOF_FAILED") from exc

    registry_token = text(token_body.get("token") or token_body.get("access_token"))
    if not registry_token:
        raise RuntimeError("AVANTIQO_AUDIO_GHCR_PULL_TOKEN_MISSING")

    manifest_request = Request(
        f"https://ghcr.io/v2/{AUDIO_GHCR_REPOSITORY}/manifests/{quote(AUDIO_GHCR_DIGEST, safe=':')}",
        headers={
            "Authorization": f"Bearer {registry_token}",
            "Accept": ", ".join((
                "application/vnd.oci.image.index.v1+json",
                "application/vnd.oci.image.manifest.v1+json",
                "application/vnd.docker.distribution.manifest.list.v2+json",
                "application/vnd.docker.distribution.manifest.v2+json",
            )),
        },
    )
    try:
        with urlopen(manifest_request, timeout=30) as response:
            content_digest = text(response.headers.get("docker-content-digest"))
            response.read()
    except (HTTPError, URLError, OSError) as exc:
        raise RuntimeError("AVANTIQO_AUDIO_GHCR_IMMUTABLE_PULL_PROOF_FAILED") from exc

    if content_digest and content_digest.lower() != AUDIO_GHCR_DIGEST.lower():
        raise RuntimeError("AVANTIQO_AUDIO_GHCR_IMMUTABLE_PULL_DIGEST_MISMATCH")

    print(
        "AVANTIQO_AUDIO_GHCR_IMMUTABLE_PULL_PROOF=PASS "
        "authenticated=true exact_digest=true secret_printed=false",
        flush=True,
    )
    return username, github_token


def deployed_url(result: subprocess.CompletedProcess[str]) -> str:
    combined = f"{result.stdout}\n{result.stderr}"
    matches = MODAL_URL_RE.findall(combined)
    if not matches:
        raise RuntimeError("AVANTIQO_OWNED_MODAL_DEPLOY_URL_NOT_FOUND")
    return matches[-1].rstrip("/")


def health(base_url: str, token: str, expected_contract: str, expected_gpu: str, expected_functions: set[str]) -> dict[str, Any]:
    last_error = "UNKNOWN"
    for attempt in range(1, HEALTH_ATTEMPTS + 1):
        request = Request(
            f"{base_url}/health",
            headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
        )
        try:
            with urlopen(request, timeout=HEALTH_TIMEOUT_SECONDS) as response:
                body = json.loads(response.read().decode("utf-8"))
            if body.get("success") is not True or body.get("contract") != expected_contract:
                raise RuntimeError("HEALTH_CONTRACT_INVALID")
            if body.get("gateway_gpu_imported") is not False:
                raise RuntimeError("HEALTH_GATEWAY_GPU_IMPORT_INVALID")
            if body.get("gpu_inference_performed") is not False:
                raise RuntimeError("HEALTH_GPU_INFERENCE_BOUNDARY_INVALID")
            if body.get("runpod_used") is not False:
                raise RuntimeError("HEALTH_RUNPOD_BOUNDARY_INVALID")
            if body.get("scale_to_zero") is not True:
                raise RuntimeError("HEALTH_SCALE_TO_ZERO_REQUIRED")
            if text(body.get("gpu_worker")) != expected_gpu:
                raise RuntimeError("HEALTH_GPU_WORKER_MISMATCH")
            functions = {text(value) for value in body.get("gpu_functions", []) if text(value)}
            if not expected_functions.issubset(functions):
                raise RuntimeError("HEALTH_GPU_FUNCTION_SET_INVALID")
            return {**body, "health_attempts_used": attempt}
        except (TimeoutError, HTTPError, URLError, OSError, ValueError, RuntimeError) as exc:
            last_error = text(exc)[:800]
            if attempt < HEALTH_ATTEMPTS:
                time.sleep(HEALTH_RETRY_SECONDS)
    raise RuntimeError(
        f"AVANTIQO_OWNED_MODAL_HEALTH_UNAVAILABLE_AFTER_{HEALTH_ATTEMPTS}_ATTEMPTS:{last_error}"
    )


def main() -> None:
    repo = Path.cwd().resolve()
    if not (repo / ".git").exists():
        raise RuntimeError("AVANTIQO_OWNED_MODAL_RUN_FROM_REPOSITORY_ROOT_REQUIRED")
    modal_cli = shutil.which("modal")
    git_cli = shutil.which("git")
    gh_cli = shutil.which("gh")
    if not modal_cli:
        raise RuntimeError("AVANTIQO_OWNED_MODAL_CLI_REQUIRED")
    if not git_cli:
        raise RuntimeError("AVANTIQO_OWNED_MODAL_GIT_REQUIRED")

    env_path = repo / ".env.local"
    run([git_cli, "fetch", "origin", "main"], cwd=repo, timeout=120)

    paid_bake_requested = any(
        approved(config["approval_env"])
        for config in ENGINES.values()
        if config["model_bake_required"]
    )

    selected: dict[str, dict[str, Any]] = {}
    skipped: dict[str, dict[str, Any]] = {}
    for name, config in ENGINES.items():
        approval_env = config["approval_env"]
        if name == "voice" and paid_bake_requested and voice_already_connected(env_path):
            skipped[name] = {
                "reason": "ALREADY_CONNECTED_NO_REDEPLOY",
                "worker_deployed": False,
                "gateway_deployed": False,
                "gpu_inference_performed": False,
            }
        elif config["model_bake_required"] and not approved(approval_env):
            skipped[name] = {
                "reason": "MODEL_BAKE_APPROVAL_REQUIRED",
                "approval_env": approval_env,
                "worker_deployed": False,
                "gateway_deployed": False,
                "gpu_inference_performed": False,
            }
        else:
            selected[name] = config

    audio_registry_credentials: tuple[str, str] | None = None
    if "audio" in selected:
        if not gh_cli:
            raise RuntimeError("AVANTIQO_AUDIO_LOCAL_GH_CLI_REQUIRED")
        # Zero-GPU, zero-deploy proof before Modal is allowed to build anything.
        audio_registry_credentials = prove_audio_ghcr_pull(gh_cli)

    with tempfile.TemporaryDirectory(prefix="avantiqo-owned-modal-") as temp_raw:
        temp = Path(temp_raw)
        archive = temp / "owned-modal.tar"
        paths = [config["source_dir"] for config in selected.values()]
        if paths:
            with archive.open("wb") as handle:
                archived = subprocess.run(
                    [git_cli, "archive", "origin/main", *paths],
                    cwd=str(repo),
                    stdout=handle,
                    stderr=subprocess.PIPE,
                    timeout=120,
                    check=False,
                )
            if archived.returncode != 0:
                detail = archived.stderr.decode("utf-8", errors="replace")[-3000:]
                raise RuntimeError(f"AVANTIQO_OWNED_MODAL_ARCHIVE_FAILED:{detail}")
            run(["tar", "-xf", str(archive), "-C", str(temp)], timeout=120)

        results: dict[str, dict[str, Any]] = {}
        for name, config in selected.items():
            engine_dir = temp / config["source_dir"]
            print(
                f"AVANTIQO_{name.upper()}_MODAL_WORKER_DEPLOY_START "
                f"model_bake_approved={str(approved(config['approval_env'])).lower()} "
                "gpu_inference=false",
                flush=True,
            )

            worker_env: dict[str, str] | None = None
            if name == "audio":
                assert audio_registry_credentials is not None
                worker_env = {
                    "AVANTIQO_MODAL_REGISTRY_USERNAME": audio_registry_credentials[0],
                    "AVANTIQO_MODAL_REGISTRY_PASSWORD": audio_registry_credentials[1],
                }
            run(
                [modal_cli, "deploy", "modal_app.py"],
                cwd=engine_dir,
                timeout=3 * 60 * 60,
                env_updates=worker_env,
                secret_command=name == "audio",
            )

            # Only after the expensive/structural worker build has succeeded do
            # we rotate the lightweight gateway secret and deploy its CPU API.
            token = secrets.token_urlsafe(48)
            if len(token) < 40:
                raise RuntimeError(f"AVANTIQO_{name.upper()}_MODAL_GATEWAY_TOKEN_GENERATION_FAILED")
            create_secret(
                modal_cli,
                name=config["secret_name"],
                key=config["secret_env"],
                value=token,
                temp=temp,
            )

            print(f"AVANTIQO_{name.upper()}_MODAL_GATEWAY_DEPLOY_START gpu_inference=false", flush=True)
            gateway_deploy = run([modal_cli, "deploy", "modal_service.py"], cwd=engine_dir, timeout=30 * 60)
            base_url = deployed_url(gateway_deploy)

            replace_env(env_path, {
                config["enabled_env"]: "true",
                config["base_env"]: base_url,
                config["token_env"]: token,
                config["timeout_env"]: "30000",
            })

            body = health(
                base_url,
                token,
                config["health_contract"],
                config["expected_gpu"],
                set(config["expected_functions"]),
            )
            results[name] = {
                "base_url": base_url,
                "health_contract": body.get("contract"),
                "health_attempts_used": body.get("health_attempts_used"),
                "gateway_gpu_imported": body.get("gateway_gpu_imported"),
                "gpu_inference_performed": body.get("gpu_inference_performed"),
                "gpu_worker": body.get("gpu_worker"),
                "gpu_functions": body.get("gpu_functions"),
                "scale_to_zero": body.get("scale_to_zero"),
                "persistent_model_volume": body.get("persistent_model_volume"),
                "worker_deployed": True,
                "gateway_deployed": True,
            }

    expected_selected = set(selected)
    success = bool(expected_selected) and expected_selected.issubset(results)
    print(json.dumps({
        "success": success,
        "contract": CONTRACT,
        "engines": results,
        "skipped": skipped,
        "audio_private_ghcr_pull_proof_performed": "audio" in selected,
        "audio_registry_credential_persisted": False,
        "audio_registry_credential_attached_to_runtime": False,
        "health_timeout_seconds_per_attempt": HEALTH_TIMEOUT_SECONDS,
        "model_bake_requires_explicit_approval": True,
        "gpu_inference_performed": False,
        "runpod_mutation_performed": False,
        "runpod_generation_routing": False,
        "production_vercel_deploy_performed": False,
        "gateway_tokens_printed": False,
        "registry_credentials_printed": False,
    }, separators=(",", ":")), flush=True)
    print(f"{CONTRACT}={'PASS' if success else 'PARTIAL'}", flush=True)


if __name__ == "__main__":
    main()
