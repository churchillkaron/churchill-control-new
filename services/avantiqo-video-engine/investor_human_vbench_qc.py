"""Normalize VBench human-video evidence into Avantiqo investor QC.

This adapter does not run generation and does not approve release. It accepts
results from VBench 2.0 and VBench-I2V, binds those result files and the QC
manifest to the exact MP4 SHA-256, applies Avantiqo investor-quality floors, and
writes only the machine-measurable checks. Eyes, hands and skin intentionally
remain exact-master visual-review requirements.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_INVESTOR_HUMAN_VBENCH_QC_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"

# Avantiqo acceptance floors, not VBench leaderboard claims. These are deliberately
# strict investor-film gates and may only be relaxed through a reviewed code change.
QUALITY_FLOORS = {
    "face_identity": 0.97,
    "anatomy": 0.97,
    "subject_consistency": 0.94,
    "motion_physics": 0.96,
    "imaging_quality": 0.72,
}

EVALUATORS = {
    "face_identity": "VBENCH2_HUMAN_IDENTITY",
    "anatomy": "VBENCH2_HUMAN_ANATOMY",
    "subject_consistency": "VBENCH_I2V_SUBJECT_CONSISTENCY",
    "motion_physics": "VBENCH_I2V_MOTION_SMOOTHNESS",
    "imaging_quality": "VBENCH_I2V_IMAGING_QUALITY",
}

ALIASES = {
    "face_identity": ("Human_Identity", "human_identity"),
    "anatomy": ("Human_Anatomy", "human_anatomy"),
    "subject_consistency": ("subject_consistency", "Subject_Consistency"),
    "motion_physics": ("motion_smoothness", "Motion_Smoothness"),
    "imaging_quality": ("imaging_quality", "Imaging_Quality"),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    if not path.is_file():
        raise RuntimeError(f"{CONTRACT}_RESULT_MISSING:{path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def dimension_score(payload: Any, aliases: tuple[str, ...]) -> float:
    """Read score from VBench's saved JSON without assuming one release shape."""
    if not isinstance(payload, dict):
        raise RuntimeError(f"{CONTRACT}_RESULT_OBJECT_REQUIRED")
    value: Any = None
    selected: str | None = None
    for alias in aliases:
        if alias in payload:
            value = payload[alias]
            selected = alias
            break
    if selected is None:
        raise RuntimeError(f"{CONTRACT}_DIMENSION_MISSING:{aliases[0]}")

    direct = _number(value)
    if direct is not None:
        score = direct
    elif isinstance(value, (list, tuple)) and value:
        first = _number(value[0])
        if first is None:
            raise RuntimeError(f"{CONTRACT}_DIMENSION_SCORE_INVALID:{selected}")
        score = first
    elif isinstance(value, dict):
        candidate = None
        for key in ("score", "all_results", "overall", "value"):
            candidate = _number(value.get(key))
            if candidate is not None:
                break
        if candidate is None:
            raise RuntimeError(f"{CONTRACT}_DIMENSION_SCORE_INVALID:{selected}")
        score = candidate
    else:
        raise RuntimeError(f"{CONTRACT}_DIMENSION_SCORE_INVALID:{selected}")

    if not 0.0 <= score <= 1.0:
        raise RuntimeError(f"{CONTRACT}_DIMENSION_SCORE_OUT_OF_RANGE:{selected}:{score}")
    return score


def evidence_id(result_sha: str, evaluator: str, score: float) -> str:
    raw = f"{CONTRACT}:{result_sha}:{evaluator}:{score:.12f}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def evaluate(
    *,
    video: Path,
    qc_payload: dict[str, Any],
    vbench2_payload: dict[str, Any],
    vbench2_sha: str,
    i2v_payload: dict[str, Any],
    i2v_sha: str,
) -> dict[str, Any]:
    video_sha = sha256(video)
    if qc_payload.get("video_sha256") != video_sha:
        raise RuntimeError(f"{CONTRACT}_QC_VIDEO_DIGEST_MISMATCH")
    if qc_payload.get("fine_detail_visual_review_required") is not True:
        raise RuntimeError(f"{CONTRACT}_FINE_DETAIL_VISUAL_REVIEW_REQUIRED")

    existing = qc_payload.get("checks")
    if not isinstance(existing, dict):
        raise RuntimeError(f"{CONTRACT}_QC_CHECKS_REQUIRED")

    checks = dict(existing)
    all_pass = True
    for name, floor in QUALITY_FLOORS.items():
        payload = vbench2_payload if name in {"face_identity", "anatomy"} else i2v_payload
        result_sha = vbench2_sha if name in {"face_identity", "anatomy"} else i2v_sha
        score = dimension_score(payload, ALIASES[name])
        passed = score >= floor
        all_pass = all_pass and passed
        checks[name] = {
            "status": "PASS" if passed else "FAIL",
            "evidence_id": evidence_id(result_sha, EVALUATORS[name], score),
            "score": score,
            "minimum_score": floor,
            "evaluator": EVALUATORS[name],
            "video_sha256": video_sha,
            "result_sha256": result_sha,
        }

    for fine_detail in ("eyes", "hands", "skin_texture"):
        item = checks.get(fine_detail)
        if not isinstance(item, dict) or item.get("status") not in {
            "VISUAL_REVIEW_REQUIRED",
            "NOT_MACHINE_CERTIFIED",
        }:
            raise RuntimeError(f"{CONTRACT}_FALSE_FINE_DETAIL_MACHINE_CERTIFICATION:{fine_detail}")

    return {
        **qc_payload,
        "status": "PASS" if all_pass else "FAIL",
        "contract": "AVANTIQO_INVESTOR_HUMAN_QC_PACK_V1",
        "source_repository": SOURCE_REPOSITORY,
        "video_sha256": video_sha,
        "fine_detail_visual_review_required": True,
        "machine_evaluator_contract": CONTRACT,
        "vbench2_result_sha256": vbench2_sha,
        "vbench_i2v_result_sha256": i2v_sha,
        "checks": checks,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--qc", required=True)
    parser.add_argument("--vbench2-results", required=True)
    parser.add_argument("--i2v-results", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    video = Path(args.video).expanduser().resolve()
    qc_path = Path(args.qc).expanduser().resolve()
    vbench2_path = Path(args.vbench2_results).expanduser().resolve()
    i2v_path = Path(args.i2v_results).expanduser().resolve()
    output = Path(args.output).expanduser().resolve()

    if not video.is_file() or video.suffix.lower() != ".mp4":
        raise SystemExit(f"{CONTRACT}_VIDEO_INVALID")
    qc_payload = load_json(qc_path)
    result = evaluate(
        video=video,
        qc_payload=qc_payload,
        vbench2_payload=load_json(vbench2_path),
        vbench2_sha=sha256(vbench2_path),
        i2v_payload=load_json(i2v_path),
        i2v_sha=sha256(i2v_path),
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    if result["status"] != "PASS":
        print(json.dumps(result, indent=2))
        raise SystemExit(1)
    print(f"{CONTRACT}=PASS")
    print(f"VIDEO_SHA256={result['video_sha256']}")


if __name__ == "__main__":
    main()
