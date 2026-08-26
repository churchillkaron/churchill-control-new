import json
import os
from urllib.parse import quote

import boto3
import requests
from boto3.s3.transfer import TransferConfig
from botocore.config import Config
from huggingface_hub import HfApi

BUCKET = os.environ["AVANTIQO_V18_BUCKET"]
ENDPOINT = os.environ["AVANTIQO_V18_S3_ENDPOINT"]
REGION = os.environ["AVANTIQO_V18_REGION"]
MODEL = os.environ["AVANTIQO_V18_MODEL"]
ROOT = os.environ["AVANTIQO_V18_CACHE_ROOT_KEY"].strip("/")
CONTRACT = os.environ["AVANTIQO_V18_COMPLETION_CONTRACT"]
ACCESS = os.environ["AVANTIQO_V18_ACCESS_KEY"]
SECRET = os.environ["AVANTIQO_V18_SECRET_KEY"]
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=ACCESS,
    aws_secret_access_key=SECRET,
    config=Config(
        signature_version="s3v4",
        retries={"max_attempts": 10, "mode": "standard"},
        s3={"addressing_style": "path"},
    ),
)
s3.head_bucket(Bucket=BUCKET)


def model_root(model_id: str) -> str:
    return f"{ROOT}/models--{model_id.replace('/', '--')}"


def get_text(key: str) -> str:
    return s3.get_object(Bucket=BUCKET, Key=key)["Body"].read().decode("utf-8").strip()


def head_size(key: str):
    try:
        return int(s3.head_object(Bucket=BUCKET, Key=key)["ContentLength"])
    except Exception as exc:
        response = getattr(exc, "response", {})
        code = response.get("Error", {}).get("Code", "")
        status = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if code in {"404", "NoSuchKey", "NotFound"} or status == 404:
            return None
        raise


api = HfApi(token=HF_TOKEN)
info = api.model_info(repo_id=MODEL, files_metadata=True)
revision = str(info.sha or "").strip()
if not revision:
    raise RuntimeError("AVANTIQO_VIDEO_I2V_V18_HF_REVISION_REQUIRED")
siblings = [s for s in (info.siblings or []) if getattr(s, "rfilename", None)]
if not any(s.rfilename == "model_index.json" for s in siblings):
    raise RuntimeError("AVANTIQO_VIDEO_I2V_V18_MODEL_INDEX_MISSING_FROM_HF_MANIFEST")

root = model_root(MODEL)
snapshot_prefix = f"{root}/snapshots/{revision}"
marker_key = f"{snapshot_prefix}/.avantiqo-video-cache-complete.json"
try:
    s3.delete_object(Bucket=BUCKET, Key=marker_key)
except Exception:
    pass

session = requests.Session()
headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}
transfer = TransferConfig(
    multipart_threshold=64 * 1024 * 1024,
    multipart_chunksize=64 * 1024 * 1024,
    max_concurrency=1,
    use_threads=False,
)
uploaded = 0
skipped = 0
uploaded_bytes = 0
manifest_bytes = 0

for index, sibling in enumerate(siblings, start=1):
    rel = sibling.rfilename
    expected = getattr(sibling, "size", None)
    expected = int(expected) if expected is not None else None
    if expected is not None:
        manifest_bytes += expected
    key = f"{snapshot_prefix}/{rel}"
    existing = head_size(key)
    if expected is not None and existing == expected:
        skipped += 1
        print(
            f"AVANTIQO_VIDEO_I2V_V18_FILE_SKIP={index}/{len(siblings)}:{rel}:{expected}",
            flush=True,
        )
        continue

    url = (
        f"https://huggingface.co/{quote(MODEL, safe='/')}/resolve/"
        f"{revision}/{quote(rel, safe='/')}?download=true"
    )
    with session.get(
        url,
        headers=headers,
        stream=True,
        timeout=(30, 600),
        allow_redirects=True,
    ) as response:
        response.raise_for_status()
        response.raw.decode_content = True
        s3.upload_fileobj(response.raw, BUCKET, key, Config=transfer)

    actual = head_size(key)
    if expected is not None and actual != expected:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_I2V_V18_SIZE_VERIFY_FAILED:{rel}:expected={expected}:actual={actual}"
        )
    uploaded += 1
    uploaded_bytes += int(actual or expected or 0)
    print(
        f"AVANTIQO_VIDEO_I2V_V18_FILE_UPLOADED={index}/{len(siblings)}:{rel}:{actual}",
        flush=True,
    )

# Verify every Hugging Face manifest entry before publishing refs/main and the marker.
for sibling in siblings:
    rel = sibling.rfilename
    expected = getattr(sibling, "size", None)
    expected = int(expected) if expected is not None else None
    actual = head_size(f"{snapshot_prefix}/{rel}")
    if actual is None or (expected is not None and actual != expected):
        raise RuntimeError(
            f"AVANTIQO_VIDEO_I2V_V18_FINAL_MANIFEST_VERIFY_FAILED:{rel}:expected={expected}:actual={actual}"
        )

s3.put_object(
    Bucket=BUCKET,
    Key=f"{root}/refs/main",
    Body=revision.encode("utf-8"),
    ContentType="text/plain",
)
marker = {
    "contract": CONTRACT,
    "target_model": MODEL,
    "snapshot_revision": revision,
    "snapshot_download_completed": True,
}
s3.put_object(
    Bucket=BUCKET,
    Key=marker_key,
    Body=json.dumps(marker, separators=(",", ":"), sort_keys=True).encode("utf-8"),
    ContentType="application/json",
)
verified_marker = json.loads(get_text(marker_key))
if (
    verified_marker != marker
    or get_text(f"{root}/refs/main") != revision
    or head_size(f"{snapshot_prefix}/model_index.json") is None
):
    raise RuntimeError("AVANTIQO_VIDEO_I2V_V18_COMPLETION_PUBLISH_VERIFY_FAILED")

print(
    json.dumps(
        {
            "success": True,
            "contract": "AVANTIQO_VIDEO_WAN22_I2V_A14B_S3_DIRECT_CACHE_V18",
            "target_model": MODEL,
            "snapshot_revision": revision,
            "manifest_file_count": len(siblings),
            "manifest_bytes": manifest_bytes,
            "files_uploaded": uploaded,
            "files_skipped_existing": skipped,
            "uploaded_bytes_this_run": uploaded_bytes,
            "t2v_preserved_untouched": True,
            "t2v_revalidation_deferred_to_runtime_probe": True,
            "completion_marker_published_last": True,
            "serverless_job_submitted": False,
            "pod_created": False,
            "gpu_compute_used": False,
            "endpoint_mutation": False,
            "production_web_deploy": False,
            "secrets_printed": False,
        },
        indent=2,
    ),
    flush=True,
)
