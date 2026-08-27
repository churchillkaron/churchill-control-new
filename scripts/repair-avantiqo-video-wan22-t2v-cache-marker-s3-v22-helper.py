from __future__ import annotations

import json
import os
import time

import boto3
from botocore.config import Config
from huggingface_hub import HfApi

BUCKET = os.environ["AVANTIQO_V22_BUCKET"]
ENDPOINT = os.environ["AVANTIQO_V22_S3_ENDPOINT"]
REGION = os.environ["AVANTIQO_V22_REGION"]
MODEL = os.environ["AVANTIQO_V22_MODEL"]
ROOT = os.environ["AVANTIQO_V22_CACHE_ROOT_KEY"].strip("/")
CONTRACT = os.environ["AVANTIQO_V22_COMPLETION_CONTRACT"]
ACCESS = os.environ["AVANTIQO_V22_ACCESS_KEY"]
SECRET = os.environ["AVANTIQO_V22_SECRET_KEY"]
APPLY = os.environ.get("AVANTIQO_V22_APPLY", "0").strip().lower() in {"1", "true", "yes", "on"}
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None
MAX_S3_ATTEMPTS = 8
TRANSIENT_S3_STATUSES = {408, 425, 429, 500, 502, 503, 504, 520, 522, 524}
TRANSIENT_S3_CODES = {
    "408", "425", "429", "500", "502", "503", "504", "520", "522", "524",
    "InternalError", "RequestTimeout", "RequestTimeoutException", "ServiceUnavailable",
    "SlowDown", "Throttling", "ThrottlingException",
}

s3 = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    region_name=REGION,
    aws_access_key_id=ACCESS,
    aws_secret_access_key=SECRET,
    config=Config(
        signature_version="s3v4",
        retries={"max_attempts": 8, "mode": "standard"},
        s3={"addressing_style": "path"},
    ),
)


def model_root(model_id: str) -> str:
    return f"{ROOT}/models--{model_id.replace('/', '--')}"


def retry_delay(attempt: int) -> int:
    return min(20, 2 ** max(0, attempt - 1))


def s3_error_details(exc):
    response = getattr(exc, "response", {}) or {}
    code = str((response.get("Error") or {}).get("Code") or "").strip()
    raw_status = (response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    try:
        status = int(raw_status) if raw_status is not None else None
    except (TypeError, ValueError):
        status = None
    return code, status


def transient_s3_error(exc) -> bool:
    code, status = s3_error_details(exc)
    return status in TRANSIENT_S3_STATUSES or code in TRANSIENT_S3_CODES


def s3_retry(label: str, operation):
    last_error = None
    for attempt in range(1, MAX_S3_ATTEMPTS + 1):
        try:
            return operation()
        except Exception as exc:
            if not transient_s3_error(exc):
                raise
            last_error = exc
            if attempt >= MAX_S3_ATTEMPTS:
                break
            code, status = s3_error_details(exc)
            print(
                f"AVANTIQO_VIDEO_T2V_V22_S3_RETRY={label}:attempt={attempt + 1}/{MAX_S3_ATTEMPTS}:status={status if status is not None else 'unknown'}:code={code or 'unknown'}",
                flush=True,
            )
            time.sleep(retry_delay(attempt))
    raise RuntimeError(f"AVANTIQO_VIDEO_T2V_V22_S3_RETRY_EXHAUSTED:{label}") from last_error


def head_size(key: str):
    try:
        result = s3_retry(
            f"head:{key.rsplit('/', 1)[-1]}",
            lambda: s3.head_object(Bucket=BUCKET, Key=key),
        )
        return int(result["ContentLength"])
    except Exception as exc:
        code, status = s3_error_details(exc)
        if code in {"404", "NoSuchKey", "NotFound"} or status == 404:
            return None
        if code in {"403", "Forbidden", "AccessDenied"} or status == 403:
            listing = s3_retry(
                f"list-exact:{key.rsplit('/', 1)[-1]}",
                lambda: s3.list_objects_v2(Bucket=BUCKET, Prefix=key, MaxKeys=2),
            )
            for item in listing.get("Contents", []):
                if item.get("Key") == key:
                    return int(item["Size"])
            return None
        raise


def get_text_optional(key: str):
    if head_size(key) is None:
        return None
    result = s3_retry(
        f"get:{key.rsplit('/', 1)[-1]}",
        lambda: s3.get_object(Bucket=BUCKET, Key=key),
    )
    return result["Body"].read().decode("utf-8").strip()


s3_retry("head-bucket", lambda: s3.head_bucket(Bucket=BUCKET))
api = HfApi(token=HF_TOKEN)
info = api.model_info(repo_id=MODEL, files_metadata=True)
revision = str(info.sha or "").strip()
if not revision:
    raise RuntimeError("AVANTIQO_VIDEO_T2V_V22_HF_REVISION_REQUIRED")
siblings = [s for s in (info.siblings or []) if getattr(s, "rfilename", None)]
if not siblings:
    raise RuntimeError("AVANTIQO_VIDEO_T2V_V22_HF_MANIFEST_EMPTY")
if not any(s.rfilename == "model_index.json" for s in siblings):
    raise RuntimeError("AVANTIQO_VIDEO_T2V_V22_MODEL_INDEX_MISSING_FROM_HF_MANIFEST")

root = model_root(MODEL)
snapshot_prefix = f"{root}/snapshots/{revision}"
refs_main_key = f"{root}/refs/main"
marker_key = f"{snapshot_prefix}/.avantiqo-video-cache-complete.json"
legacy_marker_key = "avantiqo-cache-status/avantiqo-video-t2v-cache-marker.json"

missing = []
mismatched = []
verified_bytes = 0
manifest_bytes = 0
for index, sibling in enumerate(siblings, start=1):
    rel = sibling.rfilename
    expected = getattr(sibling, "size", None)
    if expected is None:
        raise RuntimeError(f"AVANTIQO_VIDEO_T2V_V22_HF_FILE_SIZE_REQUIRED:{rel}")
    expected = int(expected)
    manifest_bytes += expected
    actual = head_size(f"{snapshot_prefix}/{rel}")
    if actual is None:
        missing.append(rel)
        print(f"AVANTIQO_VIDEO_T2V_V22_FILE_MISSING={index}/{len(siblings)}:{rel}:{expected}", flush=True)
        continue
    if actual != expected:
        mismatched.append({"file": rel, "expected": expected, "actual": actual})
        print(f"AVANTIQO_VIDEO_T2V_V22_FILE_MISMATCH={index}/{len(siblings)}:{rel}:expected={expected}:actual={actual}", flush=True)
        continue
    verified_bytes += actual
    print(f"AVANTIQO_VIDEO_T2V_V22_FILE_VERIFIED={index}/{len(siblings)}:{rel}:{actual}", flush=True)

existing_ref = get_text_optional(refs_main_key)
existing_marker_raw = get_text_optional(marker_key)
legacy_marker_raw = get_text_optional(legacy_marker_key)
existing_marker = None
if existing_marker_raw:
    try:
        existing_marker = json.loads(existing_marker_raw)
    except json.JSONDecodeError:
        existing_marker = {"invalid_json": True}

manifest_complete = not missing and not mismatched and verified_bytes == manifest_bytes
expected_marker = {
    "contract": CONTRACT,
    "target_model": MODEL,
    "snapshot_revision": revision,
    "snapshot_download_completed": True,
}
marker_valid_before = existing_marker == expected_marker
ref_valid_before = existing_ref == revision

print(json.dumps({
    "success": True,
    "contract": "AVANTIQO_VIDEO_WAN22_T2V_S3_MARKER_REPAIR_V22",
    "mode": "APPLY" if APPLY else "VERIFY",
    "target_model": MODEL,
    "snapshot_revision": revision,
    "manifest_file_count": len(siblings),
    "manifest_bytes": manifest_bytes,
    "verified_bytes": verified_bytes,
    "missing_file_count": len(missing),
    "mismatched_file_count": len(mismatched),
    "manifest_complete": manifest_complete,
    "refs_main_valid_before": ref_valid_before,
    "completion_marker_valid_before": marker_valid_before,
    "legacy_v9_marker_present": legacy_marker_raw is not None,
    "repair_allowed": manifest_complete,
    "s3_mutation_requested": APPLY,
}, indent=2), flush=True)

if not manifest_complete:
    sample = {
        "missing": missing[:20],
        "mismatched": mismatched[:20],
    }
    raise RuntimeError(f"AVANTIQO_VIDEO_T2V_V22_MANIFEST_NOT_COMPLETE:{json.dumps(sample, separators=(',', ':'))}")

if APPLY:
    # Publish only metadata required by handler_v3 after exact manifest verification.
    s3_retry(
        "publish-ref-main",
        lambda: s3.put_object(
            Bucket=BUCKET,
            Key=refs_main_key,
            Body=revision.encode("utf-8"),
            ContentType="text/plain",
        ),
    )
    s3_retry(
        "publish-completion-marker",
        lambda: s3.put_object(
            Bucket=BUCKET,
            Key=marker_key,
            Body=json.dumps(expected_marker, separators=(",", ":"), sort_keys=True).encode("utf-8"),
            ContentType="application/json",
        ),
    )

final_ref = get_text_optional(refs_main_key)
final_marker_raw = get_text_optional(marker_key)
try:
    final_marker = json.loads(final_marker_raw) if final_marker_raw else None
except json.JSONDecodeError:
    final_marker = None

if final_ref != revision or final_marker != expected_marker:
    raise RuntimeError("AVANTIQO_VIDEO_T2V_V22_METADATA_VERIFY_FAILED")

print(json.dumps({
    "success": True,
    "contract": "AVANTIQO_VIDEO_WAN22_T2V_S3_MARKER_REPAIR_V22",
    "target_model": MODEL,
    "snapshot_revision": revision,
    "manifest_file_count": len(siblings),
    "manifest_bytes": manifest_bytes,
    "manifest_verified_exact": True,
    "refs_main_valid": True,
    "completion_marker_valid": True,
    "completion_marker_published_after_full_manifest_verification": APPLY,
    "model_files_mutated": False,
    "legacy_v9_marker_preserved": True,
    "serverless_job_submitted": False,
    "pod_created": False,
    "gpu_compute_used": False,
    "endpoint_mutation": False,
    "production_web_deploy": False,
    "secrets_printed": False,
}, indent=2), flush=True)
print("AVANTIQO_VIDEO_WAN22_T2V_S3_MARKER_REPAIR_V22=PASS", flush=True)
