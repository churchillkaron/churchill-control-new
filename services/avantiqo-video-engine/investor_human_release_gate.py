"""Fail-closed release gate for investor footage containing generated humans.

Generation evidence is never sufficient for release. Each human clip must prove
approved same-identity multi-keyframe generation, byte-bound machine preflight on
the dimensions that current evaluators can actually measure, and an exact-master
visual review for the fine human details that automated benchmarks cannot safely
certify on their own.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_INVESTOR_HUMAN_RELEASE_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"
FAST_GENERATION_CONTRACT = "AVANTIQO_VIDEO_HUMAN_FAST_DISTILLED_MULTI_KEYFRAME_V1"
LEGACY_NATIVE_GENERATION_CONTRACT = "AVANTIQO_VIDEO_HUMAN_MULTI_KEYFRAME_NATIVE_MASTER_V1"
ALLOWED_GENERATION_CONTRACTS = {
    FAST_GENERATION_CONTRACT,
    LEGACY_NATIVE_GENERATION_CONTRACT,
}
MIN_KEYFRAMES = 3
MAX_KEYFRAMES = 8
MIN_SAMPLED_FRAMES = 12

# These are intentionally limited to dimensions with defensible automated
# evaluators. Eyes, hands and skin remain mandatory exact-master visual-review
# dimensions instead of receiving fabricated proxy scores.
REQUIRED_AUTOMATED_CHECKS = (
    "face_identity",
    "anatomy",
    "subject_consistency",
    "motion_physics",
    "imaging_quality",
)
REQUIRED_VISUAL_REVIEW_DIMENSIONS = (
    "identity",
    "face",
    "eyes",
    "hands",
    "anatomy",
    "skin",
    "motion",
)
ALLOWED_AUTOMATED_EVALUATORS = {
    "face_identity": {"VBENCH2_HUMAN_IDENTITY"},
    "anatomy": {"VBENCH2_HUMAN_ANATOMY"},
    "subject_consistency": {"VBENCH_I2V_SUBJECT_CONSISTENCY", "VBENCH_I2V_I2V_SUBJECT"},
    "motion_physics": {"VBENCH_I2V_MOTION_SMOOTHNESS"},
    "imaging_quality": {"VBENCH_I2V_IMAGING_QUALITY"},
}


def _text(value: Any) -> str:
    return str(value or "").strip()


def _obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _valid_sha256(value: Any) -> bool:
    text = _text(value).lower()
    return len(text) == 64 and all(char in "0123456789abcdef" for char in text)


def _require(condition: bool, code: str, failures: list[str]) -> None:
    if not condition:
        failures.append(code)


def _validate_generation(clip_id: str, generation: dict[str, Any], failures: list[str]) -> None:
    prefix = f"{clip_id}:generation"
    _require(generation.get("success") is True, f"{prefix}:success_required", failures)
    _require(generation.get("contract") in ALLOWED_GENERATION_CONTRACTS, f"{prefix}:contract_invalid", failures)
    _require(generation.get("source_repository") == SOURCE_REPOSITORY, f"{prefix}:repository_invalid", failures)
    _require(generation.get("human_mode") is True, f"{prefix}:human_mode_required", failures)
    _require(
        generation.get("conditioning_mode") == "approved_same_identity_multi_keyframe",
        f"{prefix}:conditioning_invalid",
        failures,
    )
    count = generation.get("condition_count")
    _require(isinstance(count, int) and MIN_KEYFRAMES <= count <= MAX_KEYFRAMES, f"{prefix}:keyframe_count_invalid", failures)
    frames = generation.get("condition_frames")
    _require(isinstance(frames, list) and len(frames) == count, f"{prefix}:condition_frames_invalid", failures)
    if isinstance(frames, list) and frames:
        _require(frames[0] == 0, f"{prefix}:opening_anchor_missing", failures)
        _require(frames == sorted(set(frames)), f"{prefix}:condition_frames_not_unique_sorted", failures)
    approvals = generation.get("condition_approvals")
    _require(isinstance(approvals, list) and len(approvals) == count, f"{prefix}:approvals_invalid", failures)
    if isinstance(approvals, list):
        for index, approval in enumerate(approvals):
            item = _obj(approval)
            _require(bool(_text(item.get("approval_id"))), f"{prefix}:approval_id_missing:{index}", failures)
            _require(_valid_sha256(item.get("sha256")), f"{prefix}:approval_sha_invalid:{index}", failures)
    _require(_valid_sha256(generation.get("output_sha256")), f"{prefix}:output_sha_invalid", failures)
    _require(generation.get("identity_keyframes_byte_verified") is True, f"{prefix}:byte_verification_required", failures)
    _require(generation.get("release_authorized") is False, f"{prefix}:generation_must_not_authorize_release", failures)


def _validate_automated_qc(clip_id: str, qc: dict[str, Any], video_sha256: str, failures: list[str]) -> None:
    prefix = f"{clip_id}:automated_qc"
    _require(qc.get("status") == "PASS", f"{prefix}:status_not_pass", failures)
    sampled = qc.get("sampled_frames")
    _require(isinstance(sampled, int) and sampled >= MIN_SAMPLED_FRAMES, f"{prefix}:insufficient_frame_sampling", failures)
    _require(qc.get("video_sha256") == video_sha256, f"{prefix}:video_digest_mismatch", failures)
    _require(qc.get("fine_detail_visual_review_required") is True, f"{prefix}:fine_detail_review_flag_required", failures)
    checks = _obj(qc.get("checks"))
    for name in REQUIRED_AUTOMATED_CHECKS:
        evidence = _obj(checks.get(name))
        _require(evidence.get("status") == "PASS", f"{prefix}:{name}:not_pass", failures)
        _require(bool(_text(evidence.get("evidence_id"))), f"{prefix}:{name}:evidence_missing", failures)
        evaluator = _text(evidence.get("evaluator"))
        _require(
            evaluator in ALLOWED_AUTOMATED_EVALUATORS[name],
            f"{prefix}:{name}:evaluator_invalid",
            failures,
        )
        _require(evidence.get("video_sha256") == video_sha256, f"{prefix}:{name}:video_digest_mismatch", failures)
        score = evidence.get("score")
        _require(isinstance(score, (int, float)) and 0.0 <= float(score) <= 1.0, f"{prefix}:{name}:score_invalid", failures)

    # Fine-detail categories must never be smuggled through as benchmark scores.
    for unsupported in ("eyes", "hands", "skin_texture"):
        if unsupported in checks:
            evidence = _obj(checks.get(unsupported))
            _require(
                evidence.get("status") in {"VISUAL_REVIEW_REQUIRED", "NOT_MACHINE_CERTIFIED"},
                f"{prefix}:{unsupported}:false_machine_certification",
                failures,
            )


def _validate_visual_review(clip_id: str, review: dict[str, Any], video_sha256: str, failures: list[str]) -> None:
    prefix = f"{clip_id}:visual_review"
    _require(review.get("status") == "APPROVED", f"{prefix}:approval_required", failures)
    _require(review.get("video_sha256") == video_sha256, f"{prefix}:video_digest_mismatch", failures)
    _require(bool(_text(review.get("reviewer_id"))), f"{prefix}:reviewer_required", failures)
    _require(bool(_text(review.get("reviewed_at"))), f"{prefix}:timestamp_required", failures)
    _require(_valid_sha256(review.get("contact_sheet_sha256")), f"{prefix}:contact_sheet_digest_required", failures)
    _require(review.get("exact_master_reviewed") is True, f"{prefix}:exact_master_review_required", failures)
    dimensions = _obj(review.get("dimensions"))
    for category in REQUIRED_VISUAL_REVIEW_DIMENSIONS:
        _require(dimensions.get(category) == "PASS", f"{prefix}:{category}:not_pass", failures)


def evaluate(manifest: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    _require(manifest.get("contract") == CONTRACT, "manifest:contract_invalid", failures)
    _require(manifest.get("source_repository") == SOURCE_REPOSITORY, "manifest:repository_invalid", failures)
    clips = manifest.get("clips")
    _require(isinstance(clips, list) and bool(clips), "manifest:clips_required", failures)

    human_clip_count = 0
    if isinstance(clips, list):
        for index, raw_clip in enumerate(clips):
            clip = _obj(raw_clip)
            clip_id = _text(clip.get("id")) or f"clip-{index}"
            if clip.get("contains_generated_human") is not True:
                continue
            human_clip_count += 1
            generation = _obj(clip.get("generation"))
            _validate_generation(clip_id, generation, failures)
            video_sha256 = _text(generation.get("output_sha256")).lower()
            _validate_automated_qc(clip_id, _obj(clip.get("automated_qc")), video_sha256, failures)
            _validate_visual_review(clip_id, _obj(clip.get("visual_review")), video_sha256, failures)

    _require(human_clip_count > 0, "manifest:no_generated_human_clips", failures)
    return {
        "success": not failures,
        "contract": CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "allowed_generation_contracts": sorted(ALLOWED_GENERATION_CONTRACTS),
        "preferred_generation_contract": FAST_GENERATION_CONTRACT,
        "human_clip_count": human_clip_count,
        "automated_qc_scope": list(REQUIRED_AUTOMATED_CHECKS),
        "visual_review_scope": list(REQUIRED_VISUAL_REVIEW_DIMENSIONS),
        "fine_detail_machine_certification_forbidden": True,
        "release_authorized": not failures,
        "release_status": "AUTHORIZED" if not failures else "BLOCKED",
        "failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    if not manifest_path.is_file():
        raise SystemExit(f"{CONTRACT}_MANIFEST_MISSING")
    result = evaluate(json.loads(manifest_path.read_text(encoding="utf-8")))
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    if not result["success"]:
        print(json.dumps(result, indent=2))
        raise SystemExit(1)
    print(f"{CONTRACT}=PASS")


if __name__ == "__main__":
    main()
