import json
import os
import time
from urllib.parse import quote

import boto3
import requests
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
PART_SIZE = 64 * 1024 * 1024
READ_CHUNK_SIZE = 8 * 1024 * 1024
MAX_HTTP_ATTEMPTS = 8
MAX_S3_ATTEMPTS = 10
HTTP_TIMEOUT = (30, 180)
TRANSIENT_S3_STATUSES = {408, 425, 429, 500, 502, 503, 504, 520, 522, 524}
TRANSIENT_S3_CODES = {
    "408",
    "425",
    "429",
    "500",
    "502",
    "503",
    "504",
    "520",
    "522",
    "524",
    "InternalError",
    "RequestTimeout",
    "RequestTimeoutException",
    "ServiceUnavailable",
    "SlowDown",
    "Throttling",
    "ThrottlingException",
}

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


def model_root(model_id: str) -> str:
    return f"{ROOT}/models--{model_id.replace('/', '--')}"


def retry_delay(attempt: int) -> int:
    return min(30, 2 ** max(0, attempt - 1))


def s3_error_details(exc) -> tuple[str, int | None]:
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
            code, status = s3_error_details(exc)
            if attempt >= MAX_S3_ATTEMPTS:
                break
            print(
                f"AVANTIQO_VIDEO_I2V_V18_S3_RETRY={label}:attempt={attempt + 1}/{MAX_S3_ATTEMPTS}:status={status if status is not None else 'unknown'}:code={code or 'unknown'}",
                flush=True,
            )
            time.sleep(retry_delay(attempt))
    raise RuntimeError(
        f"AVANTIQO_VIDEO_I2V_V18_S3_RETRY_EXHAUSTED:{label}:attempts={MAX_S3_ATTEMPTS}"
    ) from last_error


s3_retry("head-bucket", lambda: s3.head_bucket(Bucket=BUCKET))


def get_text(key: str) -> str:
    result = s3_retry(
        f"get-object:{key.rsplit('/', 1)[-1]}",
        lambda: s3.get_object(Bucket=BUCKET, Key=key),
    )
    return result["Body"].read().decode("utf-8").strip()


def head_size(key: str):
    try:
        result = s3_retry(
            f"head-object:{key.rsplit('/', 1)[-1]}",
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


def fetch_exact_range(session, url: str, base_headers: dict, start: int, end: int, total: int, rel: str, part_number: int) -> bytes:
    expected_bytes = end - start + 1
    last_error = None
    for attempt in range(1, MAX_HTTP_ATTEMPTS + 1):
        try:
            request_headers = {**base_headers, "Range": f"bytes={start}-{end}"}
            with session.get(
                url,
                headers=request_headers,
                stream=True,
                timeout=HTTP_TIMEOUT,
                allow_redirects=True,
            ) as response:
                if response.status_code != 206:
                    raise RuntimeError(
                        f"AVANTIQO_VIDEO_I2V_V18_RANGE_STATUS_INVALID:{rel}:part={part_number}:status={response.status_code}"
                    )
                expected_content_range = f"bytes {start}-{end}/{total}"
                content_range = str(response.headers.get("content-range") or "").strip().lower()
                if content_range != expected_content_range.lower():
                    raise RuntimeError(
                        f"AVANTIQO_VIDEO_I2V_V18_CONTENT_RANGE_INVALID:{rel}:part={part_number}:expected={expected_content_range}:actual={content_range or 'missing'}"
                    )
                payload = bytearray()
                for chunk in response.iter_content(chunk_size=READ_CHUNK_SIZE):
                    if not chunk:
                        continue
                    payload.extend(chunk)
                    if len(payload) > expected_bytes:
                        raise RuntimeError(
                            f"AVANTIQO_VIDEO_I2V_V18_RANGE_TOO_LARGE:{rel}:part={part_number}:expected={expected_bytes}:actual>{expected_bytes}"
                        )
                if len(payload) != expected_bytes:
                    raise RuntimeError(
                        f"AVANTIQO_VIDEO_I2V_V18_RANGE_SIZE_INVALID:{rel}:part={part_number}:expected={expected_bytes}:actual={len(payload)}"
                    )
                return bytes(payload)
        except Exception as exc:
            last_error = exc
            if attempt >= MAX_HTTP_ATTEMPTS:
                break
            print(
                f"AVANTIQO_VIDEO_I2V_V18_PART_RETRY={rel}:part={part_number}:attempt={attempt + 1}/{MAX_HTTP_ATTEMPTS}:reason={type(exc).__name__}",
                flush=True,
            )
            time.sleep(retry_delay(attempt))
    raise RuntimeError(
        f"AVANTIQO_VIDEO_I2V_V18_PART_DOWNLOAD_FAILED:{rel}:part={part_number}:attempts={MAX_HTTP_ATTEMPTS}"
    ) from last_error


def fetch_small_file(session, url: str, base_headers: dict, expected: int, rel: str) -> bytes:
    last_error = None
    for attempt in range(1, MAX_HTTP_ATTEMPTS + 1):
        try:
            with session.get(
                url,
                headers=base_headers,
                stream=True,
                timeout=HTTP_TIMEOUT,
                allow_redirects=True,
            ) as response:
                response.raise_for_status()
                payload = bytearray()
                for chunk in response.iter_content(chunk_size=READ_CHUNK_SIZE):
                    if not chunk:
                        continue
                    payload.extend(chunk)
                    if len(payload) > expected:
                        raise RuntimeError(
                            f"AVANTIQO_VIDEO_I2V_V18_FILE_TOO_LARGE:{rel}:expected={expected}:actual>{expected}"
                        )
                if len(payload) != expected:
                    raise RuntimeError(
                        f"AVANTIQO_VIDEO_I2V_V18_FILE_SIZE_INVALID:{rel}:expected={expected}:actual={len(payload)}"
                    )
                return bytes(payload)
        except Exception as exc:
            last_error = exc
            if attempt >= MAX_HTTP_ATTEMPTS:
                break
            print(
                f"AVANTIQO_VIDEO_I2V_V18_FILE_RETRY={rel}:attempt={attempt + 1}/{MAX_HTTP_ATTEMPTS}:reason={type(exc).__name__}",
                flush=True,
            )
            time.sleep(retry_delay(attempt))
    raise RuntimeError(
        f"AVANTIQO_VIDEO_I2V_V18_FILE_DOWNLOAD_FAILED:{rel}:attempts={MAX_HTTP_ATTEMPTS}"
    ) from last_error


def upload_resilient(session, url: str, base_headers: dict, key: str, expected: int, rel: str, index: int, total_files: int) -> None:
    if expected <= PART_SIZE:
        payload = fetch_small_file(session, url, base_headers, expected, rel)
        s3_retry(
            f"put-small:{rel}",
            lambda: s3.put_object(Bucket=BUCKET, Key=key, Body=payload),
        )
        return

    created = s3_retry(
        f"create-multipart:{rel}",
        lambda: s3.create_multipart_upload(Bucket=BUCKET, Key=key),
    )
    upload_id = created.get("UploadId")
    if not upload_id:
        raise RuntimeError(f"AVANTIQO_VIDEO_I2V_V18_MULTIPART_ID_REQUIRED:{rel}")
    parts = []
    part_count = (expected + PART_SIZE - 1) // PART_SIZE
    try:
        for part_number in range(1, part_count + 1):
            start = (part_number - 1) * PART_SIZE
            end = min(expected - 1, start + PART_SIZE - 1)
            payload = fetch_exact_range(
                session,
                url,
                base_headers,
                start,
                end,
                expected,
                rel,
                part_number,
            )
            uploaded = s3_retry(
                f"upload-part:{index}/{total_files}:{rel}:part={part_number}/{part_count}",
                lambda: s3.upload_part(
                    Bucket=BUCKET,
                    Key=key,
                    UploadId=upload_id,
                    PartNumber=part_number,
                    Body=payload,
                ),
            )
            etag = uploaded.get("ETag")
            if not etag:
                raise RuntimeError(
                    f"AVANTIQO_VIDEO_I2V_V18_MULTIPART_ETAG_REQUIRED:{rel}:part={part_number}"
                )
            parts.append({"ETag": etag, "PartNumber": part_number})
            print(
                f"AVANTIQO_VIDEO_I2V_V18_PART_UPLOADED={index}/{total_files}:{rel}:part={part_number}/{part_count}:bytes={end - start + 1}",
                flush=True,
            )
        s3_retry(
            f"complete-multipart:{rel}",
            lambda: s3.complete_multipart_upload(
                Bucket=BUCKET,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            ),
        )
    except Exception:
        try:
            s3_retry(
                f"abort-multipart:{rel}",
                lambda: s3.abort_multipart_upload(
                    Bucket=BUCKET,
                    Key=key,
                    UploadId=upload_id,
                ),
            )
        except Exception:
            pass
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
    s3_retry(
        "delete-stale-completion-marker",
        lambda: s3.delete_object(Bucket=BUCKET, Key=marker_key),
    )
except Exception:
    pass

session = requests.Session()
headers = {"Authorization": f"Bearer {HF_TOKEN}"} if HF_TOKEN else {}
uploaded = 0
skipped = 0
uploaded_bytes = 0
manifest_bytes = 0

for index, sibling in enumerate(siblings, start=1):
    rel = sibling.rfilename
    expected = getattr(sibling, "size", None)
    expected = int(expected) if expected is not None else None
    if expected is None:
        raise RuntimeError(f"AVANTIQO_VIDEO_I2V_V18_HF_FILE_SIZE_REQUIRED:{rel}")
    manifest_bytes += expected
    key = f"{snapshot_prefix}/{rel}"
    existing = head_size(key)
    if existing == expected:
        skipped += 1
        print(
            f"AVANTIQO_VIDEO_I2V_V18_FILE_SKIP={index}/{len(siblings)}:{rel}:{expected}",
            flush=True,
        )
        continue

    print(
        f"AVANTIQO_VIDEO_I2V_V18_FILE_BEGIN={index}/{len(siblings)}:{rel}:{expected}",
        flush=True,
    )
    url = (
        f"https://huggingface.co/{quote(MODEL, safe='/')}/resolve/"
        f"{revision}/{quote(rel, safe='/')}?download=true"
    )
    upload_resilient(session, url, headers, key, expected, rel, index, len(siblings))

    actual = head_size(key)
    if actual != expected:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_I2V_V18_SIZE_VERIFY_FAILED:{rel}:expected={expected}:actual={actual}"
        )
    uploaded += 1
    uploaded_bytes += actual
    print(
        f"AVANTIQO_VIDEO_I2V_V18_FILE_UPLOADED={index}/{len(siblings)}:{rel}:{actual}",
        flush=True,
    )

# Verify every Hugging Face manifest entry before publishing refs/main and the marker.
for sibling in siblings:
    rel = sibling.rfilename
    expected = getattr(sibling, "size", None)
    expected = int(expected) if expected is not None else None
    if expected is None:
        raise RuntimeError(f"AVANTIQO_VIDEO_I2V_V18_HF_FILE_SIZE_REQUIRED:{rel}")
    actual = head_size(f"{snapshot_prefix}/{rel}")
    if actual != expected:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_I2V_V18_FINAL_MANIFEST_VERIFY_FAILED:{rel}:expected={expected}:actual={actual}"
        )

s3_retry(
    "publish-ref-main",
    lambda: s3.put_object(
        Bucket=BUCKET,
        Key=f"{root}/refs/main",
        Body=revision.encode("utf-8"),
        ContentType="text/plain",
    ),
)
marker = {
    "contract": CONTRACT,
    "target_model": MODEL,
    "snapshot_revision": revision,
    "snapshot_download_completed": True,
}
s3_retry(
    "publish-completion-marker",
    lambda: s3.put_object(
        Bucket=BUCKET,
        Key=marker_key,
        Body=json.dumps(marker, separators=(",", ":"), sort_keys=True).encode("utf-8"),
        ContentType="application/json",
    ),
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
            "transfer_contract": "RANGED_MULTIPART_64M_DUAL_RETRY_V2",
            "multipart_part_bytes": PART_SIZE,
            "http_attempts_per_part": MAX_HTTP_ATTEMPTS,
            "s3_attempts_per_operation": MAX_S3_ATTEMPTS,
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
