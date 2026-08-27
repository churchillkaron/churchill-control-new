from __future__ import annotations

import json
import os
import time
from typing import Any

import boto3
from botocore.config import Config
from huggingface_hub import HfApi

CONTRACT = "AVANTIQO_VIDEO_EU_RO1_CACHE_BIND_V34"
CACHE_COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1"
CACHE_ROOT = "huggingface-cache/hub"
BUCKET = os.environ["AVANTIQO_V34_BUCKET"]
ENDPOINT = os.environ["AVANTIQO_V34_S3_ENDPOINT"]
REGION = os.environ["AVANTIQO_V34_REGION"]
ACCESS_KEY = os.environ["AVANTIQO_V34_ACCESS_KEY"]
SECRET_KEY = os.environ["AVANTIQO_V34_SECRET_KEY"]
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None
MAX_ATTEMPTS = 6
TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504, 520, 522, 524}
TRANSIENT_CODES = {
    "408", "425", "429", "500", "502", "503", "504", "520", "522", "524",
    "InternalError", "RequestTimeout", "RequestTimeoutException", "ServiceUnavailable",
    "SlowDown", "Throttling", "ThrottlingException",
}

MODEL_SPECS = (
    {
        "label": "T2V",
        "model": "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        "revision": "5be7df9619b54f4e2667b2755bc6a756675b5cd7",
        "file_count": 49,
        "bytes": 126_200_628_126,
    },
    {
        "label": "I2V",
        "model": "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
        "revision": "596658fd9ca6b7b71d5057529bbf319ecbc61d74",
        "file_count": 50,
        "bytes": 126_204_155_463,
    },
)


def client():
    return boto3.client(
        "s3",
        endpoint_url=ENDPOINT,
        region_name=REGION,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 8, "mode": "standard"},
            s3={"addressing_style": "path"},
        ),
    )


s3 = client()
hf = HfApi(token=HF_TOKEN)


def model_root(model: str) -> str:
    return f"{CACHE_ROOT}/models--{model.replace('/', '--')}"


def error_details(exc) -> tuple[str, int | None]:
    response = getattr(exc, "response", {}) or {}
    code = str((response.get("Error") or {}).get("Code") or "").strip()
    raw_status = (response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    try:
        status = int(raw_status) if raw_status is not None else None
    except (TypeError, ValueError):
        status = None
    return code, status


def transient(exc) -> bool:
    code, status = error_details(exc)
    return code in TRANSIENT_CODES or status in TRANSIENT_STATUS


def retry(label: str, fn):
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return fn()
        except Exception as exc:
            if not transient(exc):
                raise
            last = exc
            if attempt >= MAX_ATTEMPTS:
                break
            print(f"AVANTIQO_VIDEO_V34_RETRY={label}:attempt={attempt + 1}/{MAX_ATTEMPTS}", flush=True)
            time.sleep(min(15, 2 ** (attempt - 1)))
    raise RuntimeError(f"AVANTIQO_VIDEO_V34_RETRY_EXHAUSTED:{label}") from last


def head_size(key: str) -> int:
    response = retry(f"head:{key.rsplit('/', 1)[-1]}", lambda: s3.head_object(Bucket=BUCKET, Key=key))
    return int(response["ContentLength"])


def read_text(key: str) -> str:
    response = retry(f"get:{key.rsplit('/', 1)[-1]}", lambda: s3.get_object(Bucket=BUCKET, Key=key))
    return response["Body"].read().decode("utf-8").strip()


def manifest(spec: dict[str, Any]) -> list[dict[str, Any]]:
    info = retry(
        f"hf-manifest:{spec['label']}",
        lambda: hf.model_info(repo_id=spec["model"], revision=spec["revision"], files_metadata=True),
    )
    resolved = str(info.sha or "").strip()
    if resolved != spec["revision"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V34_HF_REVISION_INVALID:{spec['label']}:expected={spec['revision']}:actual={resolved}"
        )
    prefix = f"{model_root(spec['model'])}/snapshots/{spec['revision']}/"
    rows = []
    for sibling in info.siblings or []:
        relative = str(getattr(sibling, "rfilename", None) or "").strip()
        if not relative:
            continue
        raw_size = getattr(sibling, "size", None)
        if raw_size is None:
            raise RuntimeError(f"AVANTIQO_VIDEO_V34_HF_FILE_SIZE_MISSING:{spec['label']}:{relative}")
        rows.append({"relative": relative, "key": f"{prefix}{relative}", "size": int(raw_size)})
    rows.sort(key=lambda row: row["relative"])
    if len(rows) != spec["file_count"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V34_HF_FILE_COUNT_INVALID:{spec['label']}:expected={spec['file_count']}:actual={len(rows)}"
        )
    total = sum(row["size"] for row in rows)
    if total != spec["bytes"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V34_HF_BYTES_INVALID:{spec['label']}:expected={spec['bytes']}:actual={total}"
        )
    return rows


def validate_marker(marker: dict[str, Any], spec: dict[str, Any]):
    if marker.get("contract") != CACHE_COMPLETION_CONTRACT:
        raise RuntimeError(f"AVANTIQO_VIDEO_V34_MARKER_CONTRACT_INVALID:{spec['label']}")
    if str(marker.get("target_model") or "").strip() != spec["model"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V34_MARKER_MODEL_INVALID:{spec['label']}")
    if str(marker.get("snapshot_revision") or "").strip() != spec["revision"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V34_MARKER_REVISION_INVALID:{spec['label']}")
    if marker.get("snapshot_download_completed") is not True:
        raise RuntimeError(f"AVANTIQO_VIDEO_V34_MARKER_INCOMPLETE:{spec['label']}")


retry("head-bucket", lambda: s3.head_bucket(Bucket=BUCKET))
verified_models = []
for spec in MODEL_SPECS:
    root = model_root(spec["model"])
    ref_key = f"{root}/refs/main"
    marker_key = f"{root}/snapshots/{spec['revision']}/.avantiqo-video-cache-complete.json"
    ref = read_text(ref_key)
    if ref != spec["revision"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V34_REF_INVALID:{spec['label']}:expected={spec['revision']}:actual={ref}"
        )
    marker = json.loads(read_text(marker_key))
    validate_marker(marker, spec)
    rows = manifest(spec)
    verified_bytes = 0
    for index, row in enumerate(rows, start=1):
        actual = head_size(row["key"])
        if actual != row["size"]:
            raise RuntimeError(
                f"AVANTIQO_VIDEO_V34_FILE_SIZE_INVALID:{spec['label']}:{row['relative']}:expected={row['size']}:actual={actual}"
            )
        verified_bytes += actual
        print(
            f"AVANTIQO_VIDEO_V34_CACHE_FILE_VERIFIED={spec['label']}:{index}/{len(rows)}:{row['relative']}:{actual}",
            flush=True,
        )
    if verified_bytes != spec["bytes"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V34_VERIFIED_BYTES_INVALID:{spec['label']}:expected={spec['bytes']}:actual={verified_bytes}"
        )
    verified_models.append({
        "label": spec["label"],
        "model": spec["model"],
        "revision": spec["revision"],
        "file_count": len(rows),
        "bytes": verified_bytes,
        "completion_marker_valid": True,
        "ref_valid": True,
    })

print(json.dumps({
    "success": True,
    "contract": CONTRACT,
    "bucket": BUCKET,
    "region": REGION,
    "models": verified_models,
    "manifest_basis": "PINNED_HUGGING_FACE_REVISION_PLUS_EXACT_DESTINATION_S3_HEAD",
    "payload_downloaded_to_mac": False,
    "storage_mutation_performed": False,
    "gpu_compute_used": False,
    "runpod_job_submitted": False,
    "secrets_printed": False,
}, indent=2), flush=True)
print("AVANTIQO_VIDEO_EU_RO1_CACHE_VERIFY_V34_HELPER=PASS", flush=True)
