from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "services/avantiqo-video-engine/investor_human_release_gate.py"
spec = importlib.util.spec_from_file_location("investor_human_release_gate", MODULE)
if spec is None or spec.loader is None:
    raise RuntimeError("INVESTOR_HUMAN_RELEASE_GATE_IMPORT_FAILED")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

VIDEO_SHA = "a" * 64
CONTACT_SHEET_SHA = "b" * 64

EVALUATORS = {
    "face_identity": "VBENCH2_HUMAN_IDENTITY",
    "anatomy": "VBENCH2_HUMAN_ANATOMY",
    "subject_consistency": "VBENCH_I2V_SUBJECT_CONSISTENCY",
    "motion_physics": "VBENCH_I2V_MOTION_SMOOTHNESS",
    "imaging_quality": "VBENCH_I2V_IMAGING_QUALITY",
}


def approved_generation() -> dict:
    return {
        "success": True,
        "contract": gate.GENERATION_CONTRACT,
        "source_repository": gate.SOURCE_REPOSITORY,
        "human_mode": True,
        "conditioning_mode": "approved_same_identity_multi_keyframe",
        "condition_count": 3,
        "condition_frames": [0, 41, 81],
        "condition_approvals": [
            {"approval_id": "approval-opening", "sha256": "1" * 64},
            {"approval_id": "approval-middle", "sha256": "2" * 64},
            {"approval_id": "approval-late", "sha256": "3" * 64},
        ],
        "output_sha256": VIDEO_SHA,
        "identity_keyframes_byte_verified": True,
        "release_authorized": False,
    }


def approved_qc() -> dict:
    checks = {}
    for name in gate.REQUIRED_AUTOMATED_CHECKS:
        checks[name] = {
            "status": "PASS",
            "evidence_id": f"evidence-{name}",
            "score": 0.99,
            "evaluator": EVALUATORS[name],
            "video_sha256": VIDEO_SHA,
        }
    checks["eyes"] = {"status": "VISUAL_REVIEW_REQUIRED"}
    checks["hands"] = {"status": "VISUAL_REVIEW_REQUIRED"}
    checks["skin_texture"] = {"status": "VISUAL_REVIEW_REQUIRED"}
    return {
        "status": "PASS",
        "sampled_frames": gate.MIN_SAMPLED_FRAMES,
        "video_sha256": VIDEO_SHA,
        "fine_detail_visual_review_required": True,
        "checks": checks,
    }


def approved_review() -> dict:
    return {
        "status": "APPROVED",
        "video_sha256": VIDEO_SHA,
        "reviewer_id": "investor-human-reviewer",
        "reviewed_at": "2026-09-06T00:00:00Z",
        "contact_sheet_sha256": CONTACT_SHEET_SHA,
        "exact_master_reviewed": True,
        "dimensions": {
            "identity": "PASS",
            "face": "PASS",
            "eyes": "PASS",
            "hands": "PASS",
            "anatomy": "PASS",
            "skin": "PASS",
            "motion": "PASS",
        },
    }


def valid_manifest() -> dict:
    return {
        "contract": gate.CONTRACT,
        "source_repository": gate.SOURCE_REPOSITORY,
        "clips": [
            {
                "id": "hero-human-01",
                "contains_generated_human": True,
                "generation": approved_generation(),
                "automated_qc": approved_qc(),
                "visual_review": approved_review(),
            }
        ],
    }


def require_blocked(manifest: dict, expected_failure_fragment: str) -> None:
    result = gate.evaluate(manifest)
    assert result["success"] is False, result
    assert result["release_authorized"] is False, result
    assert result["release_status"] == "BLOCKED", result
    assert any(expected_failure_fragment in failure for failure in result["failures"]), result


def test_valid_manifest_authorizes() -> None:
    result = gate.evaluate(valid_manifest())
    assert result["success"] is True, result
    assert result["release_authorized"] is True, result
    assert result["release_status"] == "AUTHORIZED", result
    assert result["fine_detail_machine_certification_forbidden"] is True


def test_missing_qc_blocks() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["automated_qc"] = {}
    require_blocked(manifest, "automated_qc:status_not_pass")


def test_video_digest_mismatch_blocks() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["visual_review"]["video_sha256"] = "c" * 64
    require_blocked(manifest, "visual_review:video_digest_mismatch")


def test_wrong_repository_blocks() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["generation"]["source_repository"] = "churchillkaron/avantiqo"
    require_blocked(manifest, "generation:repository_invalid")


def test_anatomy_machine_failure_blocks() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["automated_qc"]["checks"]["anatomy"]["status"] = "FAIL"
    require_blocked(manifest, "automated_qc:anatomy:not_pass")


def test_fake_machine_hands_pass_blocks() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["automated_qc"]["checks"]["hands"] = {
        "status": "PASS",
        "score": 1.0,
    }
    require_blocked(manifest, "automated_qc:hands:false_machine_certification")


def test_hands_visual_failure_blocks() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["visual_review"]["dimensions"]["hands"] = "FAIL"
    require_blocked(manifest, "visual_review:hands:not_pass")


def test_exact_master_review_required() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["visual_review"]["exact_master_reviewed"] = False
    require_blocked(manifest, "visual_review:exact_master_review_required")


def test_generation_cannot_self_authorize() -> None:
    manifest = valid_manifest()
    manifest["clips"][0]["generation"]["release_authorized"] = True
    require_blocked(manifest, "generation:generation_must_not_authorize_release")


def main() -> None:
    tests = [
        test_valid_manifest_authorizes,
        test_missing_qc_blocks,
        test_video_digest_mismatch_blocks,
        test_wrong_repository_blocks,
        test_anatomy_machine_failure_blocks,
        test_fake_machine_hands_pass_blocks,
        test_hands_visual_failure_blocks,
        test_exact_master_review_required,
        test_generation_cannot_self_authorize,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print("AVANTIQO_INVESTOR_HUMAN_RELEASE_TESTS=PASS")


if __name__ == "__main__":
    main()
