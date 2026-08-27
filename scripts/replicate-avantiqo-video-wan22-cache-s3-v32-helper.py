from __future__ import annotations

import json
import math
import os
import time
from typing import Any

import boto3
from botocore.config import Config
from huggingface_hub import HfApi

CONTRACT = "AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V32"
CACHE_COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1"
CACHE_ROOT = "huggingface-cache/hub"
PART_SIZE = 64 * 1024 * 1024
MAX_ATTEMPTS = 8
TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504, 520, 522, 524}
TRANSIENT_CODES = {
    "408", "425", "429", "500", "502", "503", "504", "520", "522", "524",
    "InternalError", "RequestTimeout", "RequestTimeoutException", "ServiceUnavailable",
    "SlowDown", "Throttling", "ThrottlingException",
}
NOT_FOUND_CODES = {"404", "NoSuchKey", "NotFound"}

SOURCE_BUCKET = os.environ["AVANTIQO_V32_SOURCE_BUCKET"]
DESTINATION_BUCKET = os.environ["AVANTIQO_V32_DESTINATION_BUCKET"]
SOURCE_ENDPOINT = os.environ["AVANTIQO_V32_SOURCE_S3_ENDPOINT"]
DESTINATION_ENDPOINT = os.environ["AVANTIQO_V32_DESTINATION_S3_ENDPOINT"]
SOURCE_REGION = os.environ["AVANTIQO_V32_SOURCE_REGION"]
DESTINATION_REGION = os.environ["AVANTIQO_V32_DESTINATION_REGION"]
ACCESS_KEY = os.environ["AVANTIQO_V32_ACCESS_KEY"]
SECRET_KEY = os.environ["AVANTIQO_V32_SECRET_KEY"]
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None

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


def client(endpoint: str, region: str):
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        region_name=region,
        aws_access_key_id=ACCESS_KEY,
        aws_secret_access_key=SECRET_KEY,
        config=Config(
            signature_version="s3v4",
            retries={"max_attempts": 10, "mode": "standard"},
            s3={"addressing_style": "path"},
        ),
    )


source = client(SOURCE_ENDPOINT, SOURCE_REGION)
destination = client(DESTINATION_ENDPOINT, DESTINATION_REGION)
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


def is_not_found(exc) -> bool:
    code, status = error_details(exc)
    return code in NOT_FOUND_CODES or status == 404


def is_transient(exc) -> bool:
    code, status = error_details(exc)
    return code in TRANSIENT_CODES or status in TRANSIENT_STATUS


def retry(label: str, fn):
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return fn()
        except Exception as exc:
            if not is_transient(exc):
                raise
            last = exc
            if attempt >= MAX_ATTEMPTS:
                break
            code, status = error_details(exc)
            print(
                f"AVANTIQO_VIDEO_V32_RETRY={label}:attempt={attempt + 1}/{MAX_ATTEMPTS}:status={status}:code={code or 'unknown'}",
                flush=True,
            )
            time.sleep(min(20, 2 ** (attempt - 1)))
    raise RuntimeError(f"AVANTIQO_VIDEO_V32_RETRY_EXHAUSTED:{label}") from last


def head_size(s3, bucket: str, key: str) -> int | None:
    try:
        result = retry(
            f"head:{key.rsplit('/', 1)[-1]}",
            lambda: s3.head_object(Bucket=bucket, Key=key),
        )
        return int(result["ContentLength"])
    except Exception as exc:
        if is_not_found(exc):
            return None
        raise


def read_bytes(s3, bucket: str, key: str, byte_range: str | None = None) -> bytes:
    def op():
        kwargs: dict[str, Any] = {"Bucket": bucket, "Key": key}
        if byte_range:
            kwargs["Range"] = byte_range
        response = s3.get_object(**kwargs)
        return response["Body"].read()
    return retry(f"get:{key.rsplit('/', 1)[-1]}", op)


def read_text_optional(s3, bucket: str, key: str) -> str | None:
    if head_size(s3, bucket, key) is None:
        return None
    return read_bytes(s3, bucket, key).decode("utf-8").strip()


def put_bytes(s3, bucket: str, key: str, payload: bytes, content_type: str | None = None):
    kwargs: dict[str, Any] = {"Bucket": bucket, "Key": key, "Body": payload}
    if content_type:
        kwargs["ContentType"] = content_type
    retry(f"put:{key.rsplit('/', 1)[-1]}", lambda: s3.put_object(**kwargs))


def build_manifest(spec: dict[str, Any]) -> list[dict[str, Any]]:
    info = retry(
        f"hf-manifest:{spec['label']}",
        lambda: hf.model_info(
            repo_id=spec["model"],
            revision=spec["revision"],
            files_metadata=True,
        ),
    )
    if str(info.sha or "").strip() != spec["revision"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_HF_REVISION_INVALID:{spec['label']}")
    prefix = f"{model_root(spec['model'])}/snapshots/{spec['revision']}/"
    manifest = []
    for sibling in info.siblings or []:
        relative = str(getattr(sibling, "rfilename", None) or "").strip()
        if not relative:
            continue
        raw_size = getattr(sibling, "size", None)
        if raw_size is None:
            raise RuntimeError(f"AVANTIQO_VIDEO_V32_HF_SIZE_MISSING:{spec['label']}:{relative}")
        manifest.append({"key": f"{prefix}{relative}", "relative": relative, "size": int(raw_size)})
    manifest.sort(key=lambda item: item["relative"])
    if len(manifest) != spec["file_count"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V32_HF_FILE_COUNT_INVALID:{spec['label']}:expected={spec['file_count']}:actual={len(manifest)}"
        )
    total = sum(item["size"] for item in manifest)
    if total != spec["bytes"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V32_HF_BYTES_INVALID:{spec['label']}:expected={spec['bytes']}:actual={total}"
        )
    if not any(item["relative"] == "model_index.json" for item in manifest):
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_MODEL_INDEX_MISSING:{spec['label']}")
    return manifest


def validate_marker(marker: dict[str, Any], spec: dict[str, Any], side: str):
    if marker.get("contract") != CACHE_COMPLETION_CONTRACT:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_{side}_MARKER_CONTRACT_INVALID:{spec['label']}")
    if str(marker.get("target_model") or "").strip() != spec["model"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_{side}_MARKER_MODEL_INVALID:{spec['label']}")
    if str(marker.get("snapshot_revision") or "").strip() != spec["revision"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_{side}_MARKER_REVISION_INVALID:{spec['label']}")
    if marker.get("snapshot_download_completed") is not True:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_{side}_MARKER_INCOMPLETE:{spec['label']}")


def verify_source(spec: dict[str, Any], manifest: list[dict[str, Any]]):
    verified = 0
    for index, item in enumerate(manifest, start=1):
        actual = head_size(source, SOURCE_BUCKET, item["key"])
        if actual != item["size"]:
            raise RuntimeError(
                f"AVANTIQO_VIDEO_V32_SOURCE_SIZE_INVALID:{spec['label']}:{item['relative']}:expected={item['size']}:actual={actual}"
            )
        verified += actual
        print(
            f"AVANTIQO_VIDEO_V32_SOURCE_FILE_VERIFIED={spec['label']}:{index}/{len(manifest)}:{item['relative']}:{actual}",
            flush=True,
        )
    if verified != spec["bytes"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_SOURCE_BYTES_INVALID:{spec['label']}:{verified}")


def copy_file(spec: dict[str, Any], item: dict[str, Any], index: int, total: int) -> str:
    key = item["key"]
    size = item["size"]
    relative = item["relative"]
    existing = head_size(destination, DESTINATION_BUCKET, key)
    if existing == size:
        print(f"AVANTIQO_VIDEO_V32_FILE_SKIP={spec['label']}:{index}/{total}:{relative}:{size}", flush=True)
        return "SKIPPED"

    if size <= PART_SIZE:
        payload = read_bytes(source, SOURCE_BUCKET, key)
        if len(payload) != size:
            raise RuntimeError(f"AVANTIQO_VIDEO_V32_SMALL_READ_SIZE_INVALID:{spec['label']}:{relative}")
        put_bytes(destination, DESTINATION_BUCKET, key, payload)
    else:
        created = retry(
            f"multipart-create:{spec['label']}:{relative}",
            lambda: destination.create_multipart_upload(Bucket=DESTINATION_BUCKET, Key=key),
        )
        upload_id = str(created.get("UploadId") or "")
        if not upload_id:
            raise RuntimeError(f"AVANTIQO_VIDEO_V32_MULTIPART_ID_MISSING:{spec['label']}:{relative}")
        parts = []
        count = math.ceil(size / PART_SIZE)
        try:
            for part_number in range(1, count + 1):
                start = (part_number - 1) * PART_SIZE
                end = min(size - 1, start + PART_SIZE - 1)
                expected = end - start + 1
                payload = read_bytes(source, SOURCE_BUCKET, key, f"bytes={start}-{end}")
                if len(payload) != expected:
                    raise RuntimeError(
                        f"AVANTIQO_VIDEO_V32_RANGE_SIZE_INVALID:{spec['label']}:{relative}:part={part_number}:expected={expected}:actual={len(payload)}"
                    )
                uploaded = retry(
                    f"multipart-part:{spec['label']}:{relative}:{part_number}/{count}",
                    lambda payload=payload, part_number=part_number: destination.upload_part(
                        Bucket=DESTINATION_BUCKET,
                        Key=key,
                        UploadId=upload_id,
                        PartNumber=part_number,
                        Body=payload,
                    ),
                )
                etag = uploaded.get("ETag")
                if not etag:
                    raise RuntimeError(f"AVANTIQO_VIDEO_V32_MULTIPART_ETAG_MISSING:{relative}:{part_number}")
                parts.append({"ETag": etag, "PartNumber": part_number})
                print(
                    f"AVANTIQO_VIDEO_V32_PART={spec['label']}:{index}/{total}:{relative}:part={part_number}/{count}:bytes={expected}",
                    flush=True,
                )
            retry(
                f"multipart-complete:{spec['label']}:{relative}",
                lambda: destination.complete_multipart_upload(
                    Bucket=DESTINATION_BUCKET,
                    Key=key,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": parts},
                ),
            )
        except BaseException:
            try:
                destination.abort_multipart_upload(
                    Bucket=DESTINATION_BUCKET,
                    Key=key,
                    UploadId=upload_id,
                )
            except Exception:
                pass
            raise

    actual = head_size(destination, DESTINATION_BUCKET, key)
    if actual != size:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V32_DESTINATION_SIZE_INVALID:{spec['label']}:{relative}:expected={size}:actual={actual}"
        )
    print(f"AVANTIQO_VIDEO_V32_FILE_COPIED={spec['label']}:{index}/{total}:{relative}:{actual}", flush=True)
    return "COPIED"


def destination_complete(spec: dict[str, Any], manifest: list[dict[str, Any]]) -> bool:
    root = model_root(spec["model"])
    ref_key = f"{root}/refs/main"
    marker_key = f"{root}/snapshots/{spec['revision']}/.avantiqo-video-cache-complete.json"
    ref = read_text_optional(destination, DESTINATION_BUCKET, ref_key)
    marker_raw = read_text_optional(destination, DESTINATION_BUCKET, marker_key)
    if ref != spec["revision"] or not marker_raw:
        return False
    try:
        marker = json.loads(marker_raw)
        validate_marker(marker, spec, "DESTINATION")
    except Exception:
        return False
    return all(head_size(destination, DESTINATION_BUCKET, item["key"]) == item["size"] for item in manifest)


retry("source-head-bucket", lambda: source.head_bucket(Bucket=SOURCE_BUCKET))
retry("destination-head-bucket", lambda: destination.head_bucket(Bucket=DESTINATION_BUCKET))

results = []
for spec in MODEL_SPECS:
    root = model_root(spec["model"])
    ref_key = f"{root}/refs/main"
    marker_key = f"{root}/snapshots/{spec['revision']}/.avantiqo-video-cache-complete.json"

    source_ref = read_text_optional(source, SOURCE_BUCKET, ref_key)
    if source_ref != spec["revision"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_SOURCE_REF_INVALID:{spec['label']}:{source_ref}")
    source_marker_raw = read_text_optional(source, SOURCE_BUCKET, marker_key)
    if not source_marker_raw:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_SOURCE_MARKER_MISSING:{spec['label']}")
    source_marker = json.loads(source_marker_raw)
    validate_marker(source_marker, spec, "SOURCE")

    manifest = build_manifest(spec)
    verify_source(spec, manifest)

    if destination_complete(spec, manifest):
        print(f"AVANTIQO_VIDEO_V32_MODEL_ALREADY_COMPLETE={spec['label']}:{spec['revision']}", flush=True)
        results.append({
            "label": spec["label"],
            "revision": spec["revision"],
            "copied_files": 0,
            "skipped_files": len(manifest),
            "destination_complete": True,
        })
        continue

    # Never advertise a partial destination as complete.
    retry(
        f"delete-marker:{spec['label']}",
        lambda: destination.delete_object(Bucket=DESTINATION_BUCKET, Key=marker_key),
    )

    copied = 0
    skipped = 0
    for index, item in enumerate(manifest, start=1):
        action = copy_file(spec, item, index, len(manifest))
        if action == "COPIED":
            copied += 1
        else:
            skipped += 1

    verified_bytes = sum(head_size(destination, DESTINATION_BUCKET, item["key"]) or 0 for item in manifest)
    if verified_bytes != spec["bytes"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V32_DESTINATION_BYTES_INVALID:{spec['label']}:expected={spec['bytes']}:actual={verified_bytes}"
        )

    put_bytes(destination, DESTINATION_BUCKET, ref_key, spec["revision"].encode("utf-8"), "text/plain")
    if read_text_optional(destination, DESTINATION_BUCKET, ref_key) != spec["revision"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_DESTINATION_REF_VERIFY_FAILED:{spec['label']}")

    # Completion marker is deliberately the final write for each model.
    put_bytes(
        destination,
        DESTINATION_BUCKET,
        marker_key,
        json.dumps(source_marker, separators=(",", ":"), sort_keys=True).encode("utf-8"),
        "application/json",
    )
    if not destination_complete(spec, manifest):
        raise RuntimeError(f"AVANTIQO_VIDEO_V32_DESTINATION_COMPLETE_VERIFY_FAILED:{spec['label']}")

    results.append({
        "label": spec["label"],
        "revision": spec["revision"],
        "copied_files": copied,
        "skipped_files": skipped,
        "destination_complete": True,
    })

print(json.dumps({
    "success": True,
    "contract": CONTRACT,
    "source_bucket": SOURCE_BUCKET,
    "destination_bucket": DESTINATION_BUCKET,
    "models": results,
    "manifest_basis": "PINNED_HUGGING_FACE_REVISION_PLUS_EXACT_SOURCE_S3_HEAD",
    "s3_list_payload_sizes_trusted": False,
    "non_transient_errors_retried": False,
    "not_found_treated_as_expected_absence": True,
    "source_mutation_performed": False,
    "completion_markers_published_last": True,
    "bounded_memory_streaming": True,
    "local_full_snapshot_staging": False,
    "runpod_job_submitted": False,
    "gpu_compute_used": False,
    "endpoint_rebind_performed": False,
    "secrets_printed": False,
}, indent=2), flush=True)
print("AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V32_HELPER=PASS", flush=True)
