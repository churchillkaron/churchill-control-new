from __future__ import annotations

import json
import os
from pathlib import Path

import boto3
from botocore.config import Config
from huggingface_hub import HfApi, hf_hub_download

CONTRACT = "AVANTIQO_VIDEO_FLASHVSR_CACHE_PRELOAD_V1"
REPO_ID = "JunhaoZhuang/FlashVSR-v1.1"
REVISION = "a258bf2d58ac5a7d7193fb6ce4326aaff98ea6cb"
REQUIRED = (
    "diffusion_pytorch_model_streaming_dmd.safetensors",
    "LQ_proj_in.ckpt",
    "TCDecoder.ckpt",
)
ROOT = "flashvsr/FlashVSR-v1.1"
ENDPOINT = os.environ["AVANTIQO_FLASHVSR_S3_ENDPOINT"]
REGION = os.environ["AVANTIQO_FLASHVSR_S3_REGION"]
BUCKET = os.environ["AVANTIQO_FLASHVSR_S3_BUCKET"]
ACCESS_KEY = os.environ["AVANTIQO_FLASHVSR_S3_ACCESS_KEY"]
SECRET_KEY = os.environ["AVANTIQO_FLASHVSR_S3_SECRET_KEY"]
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    config=Config(signature_version="s3v4", retries={"max_attempts": 10, "mode": "standard"}, s3={"addressing_style": "path"}),
)
hf = HfApi(token=HF_TOKEN)

info = hf.model_info(repo_id=REPO_ID, revision=REVISION, files_metadata=True)
if str(info.sha or "").strip() != REVISION:
    raise RuntimeError("AVANTIQO_VIDEO_FLASHVSR_HF_REVISION_INVALID")
meta = {str(row.rfilename): int(row.size or 0) for row in info.siblings or []}
for filename in REQUIRED:
    if meta.get(filename, 0) <= 0:
        raise RuntimeError(f"AVANTIQO_VIDEO_FLASHVSR_HF_FILE_INVALID:{filename}")

results = []
for filename in REQUIRED:
    key = f"{ROOT}/{filename}"
    expected = meta[filename]
    existing = None
    try:
        existing = int(s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"])
    except Exception as exc:
        response = getattr(exc, "response", {}) or {}
        status = int((response.get("ResponseMetadata") or {}).get("HTTPStatusCode") or 0)
        if status != 404:
            raise
    if existing == expected:
        results.append({"file": filename, "bytes": expected, "action": "SKIPPED"})
        continue
    local = hf_hub_download(repo_id=REPO_ID, filename=filename, revision=REVISION, token=HF_TOKEN)
    if Path(local).stat().st_size != expected:
        raise RuntimeError(f"AVANTIQO_VIDEO_FLASHVSR_LOCAL_SIZE_INVALID:{filename}")
    s3.upload_file(local, BUCKET, key)
    actual = int(s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"])
    if actual != expected:
        raise RuntimeError(f"AVANTIQO_VIDEO_FLASHVSR_S3_SIZE_INVALID:{filename}:{actual}:{expected}")
    results.append({"file": filename, "bytes": expected, "action": "UPLOADED"})

marker = {
    "success": True,
    "contract": CONTRACT,
    "repo_id": REPO_ID,
    "revision": REVISION,
    "files": [{"file": row["file"], "bytes": row["bytes"]} for row in results],
    "weights_preloaded": True,
    "gpu_compute_used": False,
    "runpod_pod_created": False,
    "production_deploy_performed": False,
    "secrets_printed": False,
}
s3.put_object(Bucket=BUCKET, Key=f"{ROOT}/.avantiqo-flashvsr-v11-complete.json", Body=json.dumps(marker, separators=(",", ":")).encode("utf-8"), ContentType="application/json")
print(json.dumps({**marker, "results": results}, indent=2))
print("AVANTIQO_VIDEO_FLASHVSR_CACHE_PRELOAD_V1=PASS")
