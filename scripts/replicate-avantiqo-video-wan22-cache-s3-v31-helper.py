from __future__ import annotations

import json
import math
import os
import time
from typing import Any

import boto3
from botocore.config import Config
from huggingface_hub import HfApi

CONTRACT = "AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V31"
CACHE_COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1"
CACHE_ROOT = "huggingface-cache/hub"
SOURCE_BUCKET = os.environ["AVANTIQO_V31_SOURCE_BUCKET"]
DESTINATION_BUCKET = os.environ["AVANTIQO_V31_DESTINATION_BUCKET"]
SOURCE_ENDPOINT = os.environ["AVANTIQO_V31_SOURCE_S3_ENDPOINT"]
DESTINATION_ENDPOINT = os.environ["AVANTIQO_V31_DESTINATION_S3_ENDPOINT"]
SOURCE_REGION = os.environ["AVANTIQO_V31_SOURCE_REGION"]
DESTINATION_REGION = os.environ["AVANTIQO_V31_DESTINATION_REGION"]
ACCESS_KEY = os.environ["AVANTIQO_V31_ACCESS_KEY"]
SECRET_KEY = os.environ["AVANTIQO_V31_SECRET_KEY"]
HF_TOKEN = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN") or None
PART_SIZE = 64 * 1024 * 1024
MAX_ATTEMPTS = 8

MODEL_SPECS = (
    {
        "label": "T2V",
        "model": "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
        "revision": "5be7df9619b54f4e2667b2755bc6a756675b5cd7",
        "expected_snapshot_file_count": 49,
        "expected_snapshot_bytes": 126_200_628_126,
    },
    {
        "label": "I2V",
        "model": "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
        "revision": "596658fd9ca6b7b71d5057529bbf319ecbc61d74",
        "expected_snapshot_file_count": 50,
        "expected_snapshot_bytes": 126_204_155_463,
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


def retry(label: str, fn):
    last = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return fn()
        except Exception as exc:
            last = exc
            if attempt >= MAX_ATTEMPTS:
                break
            delay = min(20, 2 ** (attempt - 1))
            print(
                f"AVANTIQO_VIDEO_V31_RETRY={label}:attempt={attempt + 1}/{MAX_ATTEMPTS}:reason={type(exc).__name__}",
                flush=True,
            )
            time.sleep(delay)
    raise RuntimeError(f"AVANTIQO_VIDEO_V31_RETRY_EXHAUSTED:{label}") from last


def error_details(exc):
    response = getattr(exc, "response", {}) or {}
    code = str((response.get("Error") or {}).get("Code") or "").strip()
    status = (response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    return code, status


def head_size(s3, bucket: str, key: str) -> int | None:
    try:
        result = retry(
            f"head:{key.rsplit('/', 1)[-1]}",
            lambda: s3.head_object(Bucket=bucket, Key=key),
        )
        return int(result["ContentLength"])
    except Exception as exc:
        code, status = error_details(exc)
        if code in {"404", "NoSuchKey", "NotFound"} or status == 404:
            return None
        if code in {"403", "Forbidden", "AccessDenied"} or status == 403:
            page = retry(
                f"list-exact:{key.rsplit('/', 1)[-1]}",
                lambda: s3.list_objects_v2(Bucket=bucket, Prefix=key, MaxKeys=2),
            )
            for item in page.get("Contents", []) or []:
                if item.get("Key") == key:
                    # LIST size may describe a symlink object on RunPod. Do not use it
                    # as model payload evidence; this fallback is existence-only.
                    return -1
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


def read_text(s3, bucket: str, key: str) -> str:
    return read_bytes(s3, bucket, key).decode("utf-8").strip()


def put_bytes(s3, bucket: str, key: str, payload: bytes, content_type: str | None = None):
    kwargs: dict[str, Any] = {"Bucket": bucket, "Key": key, "Body": payload}
    if content_type:
        kwargs["ContentType"] = content_type
    retry(f"put:{key.rsplit('/', 1)[-1]}", lambda: s3.put_object(**kwargs))


def build_hf_manifest(spec: dict[str, Any]) -> list[dict[str, Any]]:
    info = retry(
        f"hf-manifest:{spec['label']}",
        lambda: hf.model_info(
            repo_id=spec["model"],
            revision=spec["revision"],
            files_metadata=True,
        ),
    )
    resolved_revision = str(info.sha or "").strip()
    if resolved_revision != spec["revision"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V31_HF_REVISION_MISMATCH:{spec['label']}:expected={spec['revision']}:actual={resolved_revision}"
        )
    manifest: list[dict[str, Any]] = []
    root = model_root(spec["model"])
    snapshot_prefix = f"{root}/snapshots/{spec['revision']}/"
    for sibling in info.siblings or []:
        rel = str(getattr(sibling, "rfilename", None) or "").strip()
        if not rel:
            continue
        raw_size = getattr(sibling, "size", None)
        if raw_size is None:
            raise RuntimeError(f"AVANTIQO_VIDEO_V31_HF_FILE_SIZE_MISSING:{spec['label']}:{rel}")
        manifest.append({
            "Key": f"{snapshot_prefix}{rel}",
            "Relative": rel,
            "Size": int(raw_size),
        })
    manifest.sort(key=lambda item: item["Relative"])
    file_count = len(manifest)
    total_bytes = sum(item["Size"] for item in manifest)
    if file_count != spec["expected_snapshot_file_count"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V31_HF_FILE_COUNT_INVALID:{spec['label']}:expected={spec['expected_snapshot_file_count']}:actual={file_count}"
        )
    if total_bytes != spec["expected_snapshot_bytes"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V31_HF_BYTES_INVALID:{spec['label']}:expected={spec['expected_snapshot_bytes']}:actual={total_bytes}"
        )
    if not any(item["Relative"] == "model_index.json" for item in manifest):
        raise RuntimeError(f"AVANTIQO_VIDEO_V31_HF_MODEL_INDEX_MISSING:{spec['label']}")
    return manifest


def verify_source_manifest(spec: dict[str, Any], manifest: list[dict[str, Any]]):
    verified_bytes = 0
    for index, item in enumerate(manifest, start=1):
        actual = head_size(source, SOURCE_BUCKET, item["Key"])
        if actual != item["Size"]:
            raise RuntimeError(
                f"AVANTIQO_VIDEO_V31_SOURCE_HEAD_SIZE_INVALID:{spec['label']}:{item['Relative']}:expected={item['Size']}:actual={actual}"
            )
        verified_bytes += actual
        print(
            f"AVANTIQO_VIDEO_V31_SOURCE_FILE_VERIFIED={spec['label']}:{index}/{len(manifest)}:{item['Relative']}:{actual}",
            flush=True,
        )
    if verified_bytes != spec["expected_snapshot_bytes"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V31_SOURCE_VERIFIED_BYTES_INVALID:{spec['label']}:expected={spec['expected_snapshot_bytes']}:actual={verified_bytes}"
        )


def copy_object_streamed(key: str, relative: str, expected_size: int, label: str, index: int, total: int) -> str:
    existing = head_size(destination, DESTINATION_BUCKET, key)
    if existing == expected_size:
        print(f"AVANTIQO_VIDEO_V31_OBJECT_SKIP={label}:{index}/{total}:{relative}:{expected_size}", flush=True)
        return "SKIPPED"

    if expected_size <= PART_SIZE:
        payload = read_bytes(source, SOURCE_BUCKET, key)
        if len(payload) != expected_size:
            raise RuntimeError(
                f"AVANTIQO_VIDEO_V31_SOURCE_SMALL_SIZE_MISMATCH:{label}:{relative}:expected={expected_size}:actual={len(payload)}"
            )
        put_bytes(destination, DESTINATION_BUCKET, key, payload)
    else:
        created = retry(
            f"multipart-create:{label}:{relative}",
            lambda: destination.create_multipart_upload(Bucket=DESTINATION_BUCKET, Key=key),
        )
        upload_id = str(created.get("UploadId") or "")
        if not upload_id:
            raise RuntimeError(f"AVANTIQO_VIDEO_V31_MULTIPART_UPLOAD_ID_MISSING:{label}:{relative}")
        parts = []
        part_count = math.ceil(expected_size / PART_SIZE)
        try:
            for part_number in range(1, part_count + 1):
                start = (part_number - 1) * PART_SIZE
                end = min(expected_size - 1, start + PART_SIZE - 1)
                expected_part = end - start + 1
                payload = read_bytes(source, SOURCE_BUCKET, key, f"bytes={start}-{end}")
                if len(payload) != expected_part:
                    raise RuntimeError(
                        f"AVANTIQO_VIDEO_V31_SOURCE_RANGE_SIZE_MISMATCH:{label}:{relative}:part={part_number}:expected={expected_part}:actual={len(payload)}"
                    )
                uploaded = retry(
                    f"multipart-part:{label}:{relative}:{part_number}/{part_count}",
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
                    raise RuntimeError(
                        f"AVANTIQO_VIDEO_V31_MULTIPART_ETAG_MISSING:{label}:{relative}:part={part_number}"
                    )
                parts.append({"ETag": etag, "PartNumber": part_number})
                print(
                    f"AVANTIQO_VIDEO_V31_PART={label}:{index}/{total}:{relative}:part={part_number}/{part_count}:bytes={expected_part}",
                    flush=True,
                )
            retry(
                f"multipart-complete:{label}:{relative}",
                lambda: destination.complete_multipart_upload(
                    Bucket=DESTINATION_BUCKET,
                    Key=key,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": parts},
                ),
            )
        except Exception:
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
    if actual != expected_size:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V31_DESTINATION_SIZE_VERIFY_FAILED:{label}:{relative}:expected={expected_size}:actual={actual}"
        )
    print(
        f"AVANTIQO_VIDEO_V31_OBJECT_COPIED={label}:{index}/{total}:{relative}:{actual}",
        flush=True,
    )
    return "COPIED"


def validate_marker(payload: dict[str, Any], spec: dict[str, Any], side: str):
    if payload.get("contract") != CACHE_COMPLETION_CONTRACT:
        raise RuntimeError(f"AVANTIQO_VIDEO_V31_{side}_MARKER_CONTRACT_INVALID:{spec['label']}")
    if str(payload.get("target_model") or "").strip() != spec["model"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V31_{side}_MARKER_MODEL_INVALID:{spec['label']}")
    if str(payload.get("snapshot_revision") or "").strip() != spec["revision"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V31_{side}_MARKER_REVISION_INVALID:{spec['label']}")
    if payload.get("snapshot_download_completed") is not True:
        raise RuntimeError(f"AVANTIQO_VIDEO_V31_{side}_MARKER_INCOMPLETE:{spec['label']}")


def destination_complete(spec: dict[str, Any], manifest: list[dict[str, Any]]) -> bool:
    root = model_root(spec["model"])
    snapshot_prefix = f"{root}/snapshots/{spec['revision']}/"
    marker_key = f"{snapshot_prefix}.avantiqo-video-cache-complete.json"
    ref_key = f"{root}/refs/main"
    try:
        if read_text(destination, DESTINATION_BUCKET, ref_key) != spec["revision"]:
            return False
        marker = json.loads(read_text(destination, DESTINATION_BUCKET, marker_key))
        validate_marker(marker, spec, "DESTINATION")
        for item in manifest:
            if head_size(destination, DESTINATION_BUCKET, item["Key"]) != item["Size"]:
                return False
        return True
    except Exception:
        return False


retry("source-head-bucket", lambda: source.head_bucket(Bucket=SOURCE_BUCKET))
retry("destination-head-bucket", lambda: destination.head_bucket(Bucket=DESTINATION_BUCKET))

results = []
for spec in MODEL_SPECS:
    root = model_root(spec["model"])
    snapshot_prefix = f"{root}/snapshots/{spec['revision']}/"
    marker_key = f"{snapshot_prefix}.avantiqo-video-cache-complete.json"
    ref_key = f"{root}/refs/main"

    source_ref = read_text(source, SOURCE_BUCKET, ref_key)
    if source_ref != spec["revision"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V31_SOURCE_REF_INVALID:{spec['label']}:expected={spec['revision']}:actual={source_ref}"
        )
    source_marker = json.loads(read_text(source, SOURCE_BUCKET, marker_key))
    validate_marker(source_marker, spec, "SOURCE")

    manifest = build_hf_manifest(spec)
    verify_source_manifest(spec, manifest)
    source_file_count = len(manifest)
    source_bytes = sum(item["Size"] for item in manifest)

    if destination_complete(spec, manifest):
        print(f"AVANTIQO_VIDEO_V31_MODEL_ALREADY_COMPLETE={spec['label']}:{spec['revision']}", flush=True)
        results.append({
            "label": spec["label"],
            "model": spec["model"],
            "revision": spec["revision"],
            "source_file_count": source_file_count,
            "source_bytes": source_bytes,
            "copied_files": 0,
            "skipped_files": source_file_count,
            "destination_complete": True,
            "mutation_performed": False,
        })
        continue

    retry(
        f"delete-destination-marker:{spec['label']}",
        lambda: destination.delete_object(Bucket=DESTINATION_BUCKET, Key=marker_key),
    )

    copied = 0
    skipped = 0
    for index, item in enumerate(manifest, start=1):
        action = copy_object_streamed(
            item["Key"],
            item["Relative"],
            int(item["Size"]),
            spec["label"],
            index,
            source_file_count,
        )
        if action == "COPIED":
            copied += 1
        else:
            skipped += 1

    verified_destination_bytes = 0
    for item in manifest:
        actual = head_size(destination, DESTINATION_BUCKET, item["Key"])
        if actual != item["Size"]:
            raise RuntimeError(
                f"AVANTIQO_VIDEO_V31_FINAL_DESTINATION_OBJECT_VERIFY_FAILED:{spec['label']}:{item['Relative']}:expected={item['Size']}:actual={actual}"
            )
        verified_destination_bytes += actual
    if verified_destination_bytes != spec["expected_snapshot_bytes"]:
        raise RuntimeError(
            f"AVANTIQO_VIDEO_V31_DESTINATION_BYTES_INVALID:{spec['label']}:expected={spec['expected_snapshot_bytes']}:actual={verified_destination_bytes}"
        )

    put_bytes(destination, DESTINATION_BUCKET, ref_key, spec["revision"].encode("utf-8"), "text/plain")
    if read_text(destination, DESTINATION_BUCKET, ref_key) != spec["revision"]:
        raise RuntimeError(f"AVANTIQO_VIDEO_V31_DESTINATION_REF_VERIFY_FAILED:{spec['label']}")

    marker_payload = json.dumps(
        source_marker,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    put_bytes(destination, DESTINATION_BUCKET, marker_key, marker_payload, "application/json")
    destination_marker = json.loads(read_text(destination, DESTINATION_BUCKET, marker_key))
    validate_marker(destination_marker, spec, "DESTINATION")

    if not destination_complete(spec, manifest):
        raise RuntimeError(f"AVANTIQO_VIDEO_V31_DESTINATION_COMPLETION_VERIFY_FAILED:{spec['label']}")

    results.append({
        "label": spec["label"],
        "model": spec["model"],
        "revision": spec["revision"],
        "source_file_count": source_file_count,
        "source_bytes": source_bytes,
        "copied_files": copied,
        "skipped_files": skipped,
        "destination_complete": True,
        "mutation_performed": copied > 0,
    })

report = {
    "success": True,
    "contract": CONTRACT,
    "source_bucket": SOURCE_BUCKET,
    "destination_bucket": DESTINATION_BUCKET,
    "source_endpoint": SOURCE_ENDPOINT,
    "destination_endpoint": DESTINATION_ENDPOINT,
    "models": results,
    "source_manifest_basis": "PINNED_HUGGING_FACE_REVISION_WITH_EXACT_S3_HEAD_VERIFICATION",
    "runpod_s3_list_sizes_used_for_payload_validation": False,
    "source_symlink_layout_flattened_to_destination_snapshot_files": True,
    "source_mutation_performed": False,
    "completion_markers_published_last": True,
    "bounded_memory_streaming": True,
    "local_full_snapshot_staging": False,
    "runpod_job_submitted": False,
    "gpu_compute_used": False,
    "endpoint_rebind_performed": False,
    "secrets_printed": False,
}
print(json.dumps(report, indent=2), flush=True)
print("AVANTIQO_VIDEO_WAN22_CROSS_REGION_S3_REPLICATION_V31_HELPER=PASS", flush=True)
