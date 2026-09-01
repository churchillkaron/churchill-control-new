#!/usr/bin/env python3
"""Repair Modal's gated LTX-2.5 Hugging Face secret from an entitled local token.

This script never prints token values. It scans the same local aliases used by the
previous successful HQ4K credential recovery, validates each distinct token
against the exact pinned LTX-2.5 BF16 transformer, and overwrites only the Modal
secret named `huggingface-secret` using a mode-0600 temporary dotenv file.

No GPU function is invoked, no model download is performed, no RunPod resource is
mutated, and no production deployment is performed.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

LTX_REVISION = "e8dc69fd26150afbfa20351f6bc9ac384257f9fd"
LTX_FILE = "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors"
LTX_URL = f"https://huggingface.co/Lightricks/LTX-2.5/resolve/{LTX_REVISION}/{LTX_FILE}"
MODAL_SECRET = "huggingface-secret"
TOKEN_ALIASES = (
    "HF_TOKEN",
    "HF_ACCESS_TOKEN",
    "HF_API_TOKEN",
    "HF_API_KEY",
    "HUGGING_FACE_TOKEN",
    "HUGGING_FACE_ACCESS_TOKEN",
    "HUGGING_FACE_API_TOKEN",
    "HUGGING_FACE_API_KEY",
    "HUGGING_FACE_HUB_TOKEN",
    "HUGGING_FACE_HUB_ACCESS_TOKEN",
    "HUGGINGFACE_TOKEN",
    "HUGGINGFACE_ACCESS_TOKEN",
    "HUGGINGFACE_API_TOKEN",
    "HUGGINGFACE_API_KEY",
    "HUGGINGFACE_HUB_TOKEN",
)
SUCCESS_STATUSES = {200, 206, 301, 302, 303, 307, 308}


def parse_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for original in path.read_text(encoding="utf-8").splitlines():
        line = original.strip()
        if not line or line.startswith("#"):
            continue
        match = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if not match:
            continue
        value = match.group(2).strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        else:
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
        values[match.group(1)] = value
    return values


def normalize_token(value: str | None) -> str:
    token = str(value or "").strip()
    token = re.sub(r"^Bearer\s+", "", token, flags=re.IGNORECASE)
    return token if token.startswith("hf_") and len(token) >= 20 else ""


def candidates(local: dict[str, str]) -> Iterable[tuple[str, str]]:
    seen: set[str] = set()
    merged = {**local, **os.environ}
    for name in TOKEN_ALIASES:
        token = normalize_token(os.environ.get(name) or local.get(name))
        if token and token not in seen:
            seen.add(token)
            yield name, token
    for name, value in merged.items():
        token = normalize_token(value)
        if token and token not in seen:
            seen.add(token)
            yield name, token


def entitlement_status(token: str) -> int:
    request = Request(
        LTX_URL,
        method="HEAD",
        headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "avantiqo-video-modal-hf-repair/1",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310 - fixed HF HTTPS host
            return int(response.status)
    except HTTPError as exc:
        return int(exc.code)
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"AVANTIQO_VIDEO_MODAL_HF_PREFLIGHT_NETWORK_ERROR:{type(exc).__name__}") from exc


def main() -> None:
    repo = Path.cwd().resolve()
    if not (repo / ".git").exists():
        raise RuntimeError("AVANTIQO_VIDEO_MODAL_HF_REPAIR_RUN_FROM_REPO_ROOT_REQUIRED")
    modal_cli = shutil.which("modal")
    if not modal_cli:
        raise RuntimeError("AVANTIQO_VIDEO_MODAL_CLI_REQUIRED")

    local = parse_dotenv(repo / ".env.local")
    tested = 0
    winner: tuple[str, str, int] | None = None
    for name, token in candidates(local):
        tested += 1
        status = entitlement_status(token)
        print(f"AVANTIQO_VIDEO_MODAL_HF_CREDENTIAL_TEST={name}:{status}", flush=True)
        if status in SUCCESS_STATUSES:
            winner = (name, token, status)
            break

    if winner is None:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_MODAL_LTX25_ENTITLED_LOCAL_CREDENTIAL_NOT_FOUND:tested={tested}"
        )

    name, token, status = winner
    with tempfile.TemporaryDirectory(prefix="avantiqo-video-modal-hf-") as temp_raw:
        secret_file = Path(temp_raw) / "huggingface.env"
        secret_file.write_text(f"HF_TOKEN={token}\n", encoding="utf-8")
        os.chmod(secret_file, 0o600)
        completed = subprocess.run(
            [
                modal_cli,
                "secret",
                "create",
                MODAL_SECRET,
                "--from-dotenv",
                str(secret_file),
                "--force",
            ],
            cwd=str(repo),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=120,
            check=False,
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "UNKNOWN").strip()[-1500:]
            raise RuntimeError(f"AVANTIQO_VIDEO_MODAL_HF_SECRET_UPDATE_FAILED:{detail}")

    print(f"AVANTIQO_VIDEO_MODAL_HF_SECRET_SET_FROM={name}", flush=True)
    print(f"AVANTIQO_VIDEO_MODAL_LTX25_ENTITLEMENT=PASS:{status}", flush=True)
    print("AVANTIQO_VIDEO_MODAL_HF_SECRET_REPAIR=PASS", flush=True)
    print("TOKEN_PRINTED=false", flush=True)
    print("GPU_INFERENCE_PERFORMED=false", flush=True)
    print("MODEL_DOWNLOAD_PERFORMED=false", flush=True)
    print("RUNPOD_MUTATION_PERFORMED=false", flush=True)
    print("PRODUCTION_DEPLOY_PERFORMED=false", flush=True)


if __name__ == "__main__":
    main()
