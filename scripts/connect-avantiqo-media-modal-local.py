#!/usr/bin/env python3
"""Deploy and connect Avantiqo Image + Video to Modal from an authenticated Mac.

No RunPod mutation. No Vercel deployment. Creates exactly one persistent Modal
model Volume per engine through create_if_missing, seeds it once, deploys the
async authenticated APIs, verifies health, and writes local app configuration.
"""
from __future__ import annotations

import json
import os
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen

WORKSPACE = "churchillkaron"
IMAGE_BASE_URL = f"https://{WORKSPACE}--avantiqo-image-owned-image-api.modal.run"
VIDEO_BASE_URL = f"https://{WORKSPACE}--avantiqo-video-owned-video-api.modal.run"


def text(value: Any) -> str:
    return str(value or "").strip()


def run(command: list[str], *, cwd: Path | None = None, timeout: int = 7200) -> subprocess.CompletedProcess[str]:
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
        detail = (result.stderr or result.stdout or "UNKNOWN").strip()[-4000:]
        raise RuntimeError(f"AVANTIQO_MEDIA_MODAL_COMMAND_FAILED:{' '.join(command[:3])}:{detail}")
    return result


def env_value(path: Path, name: str) -> str:
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith(f"{name}="):
            value = line.split("=", 1)[1].strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            return value
    return ""


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


def create_secret(modal_cli: str, name: str, key: str, value: str, temp: Path) -> None:
    secret_file = temp / f"{name}.env"
    secret_file.write_text(f"{key}={value}\n", encoding="utf-8")
    os.chmod(secret_file, 0o600)
    run([modal_cli, "secret", "create", name, "--from-dotenv", str(secret_file), "--force"], timeout=120)


def health(base_url: str, token: str, contract: str) -> dict[str, Any]:
    request = Request(
        f"{base_url}/health",
        headers={"Accept": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urlopen(request, timeout=45) as response:  # noqa: S310 - fixed Modal HTTPS host
        body = json.loads(response.read().decode("utf-8"))
    if body.get("success") is not True or body.get("contract") != contract:
        raise RuntimeError(f"{contract}_HEALTH_INVALID")
    if body.get("scale_to_zero") is not True or body.get("max_gpu_containers") != 1:
        raise RuntimeError(f"{contract}_SCALING_GUARD_INVALID")
    if body.get("runpod_used") is not False:
        raise RuntimeError(f"{contract}_RUNPOD_BOUNDARY_INVALID")
    return body


def main() -> None:
    repo = Path.cwd().resolve()
    if not (repo / ".git").exists():
        raise RuntimeError("AVANTIQO_MEDIA_MODAL_RUN_FROM_REPOSITORY_ROOT_REQUIRED")
    modal_cli = shutil.which("modal")
    git_cli = shutil.which("git")
    if not modal_cli:
        raise RuntimeError("AVANTIQO_MEDIA_MODAL_CLI_REQUIRED")
    if not git_cli:
        raise RuntimeError("AVANTIQO_MEDIA_GIT_REQUIRED")

    env_path = repo / ".env.local"
    hf_token = env_value(env_path, "HF_TOKEN")
    if not hf_token:
        raise RuntimeError("HF_TOKEN_REQUIRED_IN_ENV_LOCAL")

    image_token = secrets.token_urlsafe(48)
    video_token = secrets.token_urlsafe(48)
    if min(len(image_token), len(video_token)) < 40:
        raise RuntimeError("AVANTIQO_MEDIA_MODAL_GATEWAY_TOKEN_GENERATION_FAILED")

    run([git_cli, "fetch", "origin", "main"], cwd=repo, timeout=120)

    with tempfile.TemporaryDirectory(prefix="avantiqo-media-modal-") as temp_raw:
        temp = Path(temp_raw)
        create_secret(modal_cli, "huggingface-secret", "HF_TOKEN", hf_token, temp)
        create_secret(modal_cli, "avantiqo-image-gateway", "AVANTIQO_IMAGE_GATEWAY_TOKEN", image_token, temp)
        create_secret(modal_cli, "avantiqo-video-gateway", "AVANTIQO_VIDEO_GATEWAY_TOKEN", video_token, temp)

        archive = temp / "media-engines.tar"
        with archive.open("wb") as handle:
            archived = subprocess.run(
                [git_cli, "archive", "origin/main", "services/avantiqo-image-engine", "services/avantiqo-video-engine"],
                cwd=str(repo), stdout=handle, stderr=subprocess.PIPE, timeout=120, check=False,
            )
        if archived.returncode != 0:
            raise RuntimeError(f"AVANTIQO_MEDIA_MODAL_ARCHIVE_FAILED:{archived.stderr.decode('utf-8', errors='replace')[-2000:]}")
        run(["tar", "-xf", str(archive), "-C", str(temp)], timeout=120)

        image_dir = temp / "services" / "avantiqo-image-engine"
        video_dir = temp / "services" / "avantiqo-video-engine"

        print("AVANTIQO_IMAGE_MODAL_SEED_START", flush=True)
        run([modal_cli, "run", "modal_app.py::seed_cache"], cwd=image_dir, timeout=2 * 60 * 60)
        print("AVANTIQO_IMAGE_MODAL_DEPLOY_START", flush=True)
        run([modal_cli, "deploy", "modal_service.py"], cwd=image_dir, timeout=30 * 60)

        print("AVANTIQO_VIDEO_MODAL_SEED_START", flush=True)
        run([modal_cli, "run", "modal_app.py::seed_cache"], cwd=video_dir, timeout=3 * 60 * 60)
        print("AVANTIQO_VIDEO_MODAL_DEPLOY_START", flush=True)
        run([modal_cli, "deploy", "modal_service.py"], cwd=video_dir, timeout=30 * 60)

    image_health = health(IMAGE_BASE_URL, image_token, "AVANTIQO_IMAGE_MODAL_HTTP_V1")
    video_health = health(VIDEO_BASE_URL, video_token, "AVANTIQO_VIDEO_MODAL_HTTP_V1")

    replace_env(env_path, {
        "AVANTIQO_IMAGE_ENGINE_ENABLED": "true",
        "AVANTIQO_IMAGE_FOUNDATION_MODEL": "Tongyi-MAI/Z-Image",
        "AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES": "ai.image.generate",
        "AVANTIQO_IMAGE_MODAL_BASE_URL": IMAGE_BASE_URL,
        "AVANTIQO_IMAGE_MODAL_GATEWAY_TOKEN": image_token,
        "AVANTIQO_IMAGE_ENGINE_TIMEOUT_MS": "30000",
        "AVANTIQO_VIDEO_ENGINE_ENABLED": "true",
        "AVANTIQO_VIDEO_T2V_MODEL": "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        "AVANTIQO_VIDEO_I2V_MODEL": "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
        "AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES": "ai.video.generate,ai.video.image_to_video",
        "AVANTIQO_VIDEO_MODAL_BASE_URL": VIDEO_BASE_URL,
        "AVANTIQO_VIDEO_MODAL_GATEWAY_TOKEN": video_token,
        "AVANTIQO_VIDEO_ENGINE_TIMEOUT_MS": "30000",
    })

    print(json.dumps({
        "success": True,
        "contract": "AVANTIQO_MEDIA_MODAL_CUTOVER_V1",
        "image": {
            "base_url": IMAGE_BASE_URL,
            "health_contract": image_health.get("contract"),
            "model_volume": image_health.get("persistent_model_volume"),
            "max_gpu_containers": image_health.get("max_gpu_containers"),
        },
        "video": {
            "base_url": VIDEO_BASE_URL,
            "health_contract": video_health.get("contract"),
            "model_volume": video_health.get("persistent_model_volume"),
            "max_gpu_containers": video_health.get("max_gpu_containers"),
        },
        "runpod_mutation_performed": False,
        "runpod_generation_routing": False,
        "production_vercel_deploy_performed": False,
        "gateway_tokens_printed": False,
    }, separators=(",", ":")), flush=True)
    print("AVANTIQO_MEDIA_MODAL_CUTOVER_V1=PASS", flush=True)


if __name__ == "__main__":
    main()
