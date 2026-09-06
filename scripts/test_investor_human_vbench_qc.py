from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "services/avantiqo-video-engine/investor_human_vbench_qc.py"
spec = importlib.util.spec_from_file_location("investor_human_vbench_qc", MODULE)
if spec is None or spec.loader is None:
    raise RuntimeError("INVESTOR_HUMAN_VBENCH_QC_IMPORT_FAILED")
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)


def base_qc(video_sha: str) -> dict:
    return {
        "status": "PENDING",
        "video_sha256": video_sha,
        "sampled_frames": 16,
        "fine_detail_visual_review_required": True,
        "checks": {
            "face_identity": {"status": "PENDING"},
            "anatomy": {"status": "PENDING"},
            "subject_consistency": {"status": "PENDING"},
            "motion_physics": {"status": "PENDING"},
            "imaging_quality": {"status": "PENDING"},
            "eyes": {"status": "VISUAL_REVIEW_REQUIRED"},
            "hands": {"status": "VISUAL_REVIEW_REQUIRED"},
            "skin_texture": {"status": "VISUAL_REVIEW_REQUIRED"},
        },
    }


def good_vbench2() -> dict:
    return {
        "Human_Identity": [0.995, [{"video_results": 0.995}]],
        "Human_Anatomy": [0.991, [{"video_results": 0.991}]],
    }


def good_i2v() -> dict:
    return {
        "subject_consistency": [0.978, []],
        "motion_smoothness": [0.985, []],
        "imaging_quality": [0.91, []],
    }


def test_dimension_score_accepts_vbench_tuple_shape() -> None:
    assert qc.dimension_score({"Human_Identity": [0.98, []]}, ("Human_Identity",)) == 0.98


def test_good_scores_pass_and_stay_byte_bound() -> None:
    with tempfile.TemporaryDirectory() as directory:
        video = Path(directory) / "master.mp4"
        video.write_bytes(b"exact-master-bytes" * 100)
        digest = qc.sha256(video)
        result = qc.evaluate(
            video=video,
            qc_payload=base_qc(digest),
            vbench2_payload=good_vbench2(),
            vbench2_sha="1" * 64,
            i2v_payload=good_i2v(),
            i2v_sha="2" * 64,
        )
        assert result["status"] == "PASS"
        assert result["video_sha256"] == digest
        assert result["checks"]["face_identity"]["evaluator"] == "VBENCH2_HUMAN_IDENTITY"
        assert result["checks"]["hands"]["status"] == "VISUAL_REVIEW_REQUIRED"
        assert all(result["checks"][name]["video_sha256"] == digest for name in qc.QUALITY_FLOORS)


def test_low_anatomy_fails() -> None:
    with tempfile.TemporaryDirectory() as directory:
        video = Path(directory) / "master.mp4"
        video.write_bytes(b"exact-master-bytes" * 100)
        digest = qc.sha256(video)
        vbench2 = good_vbench2()
        vbench2["Human_Anatomy"] = [0.50, []]
        result = qc.evaluate(
            video=video,
            qc_payload=base_qc(digest),
            vbench2_payload=vbench2,
            vbench2_sha="1" * 64,
            i2v_payload=good_i2v(),
            i2v_sha="2" * 64,
        )
        assert result["status"] == "FAIL"
        assert result["checks"]["anatomy"]["status"] == "FAIL"


def test_wrong_video_digest_is_rejected() -> None:
    with tempfile.TemporaryDirectory() as directory:
        video = Path(directory) / "master.mp4"
        video.write_bytes(b"exact-master-bytes" * 100)
        try:
            qc.evaluate(
                video=video,
                qc_payload=base_qc("f" * 64),
                vbench2_payload=good_vbench2(),
                vbench2_sha="1" * 64,
                i2v_payload=good_i2v(),
                i2v_sha="2" * 64,
            )
        except RuntimeError as error:
            assert "QC_VIDEO_DIGEST_MISMATCH" in str(error)
        else:
            raise AssertionError("digest mismatch must fail")


def test_fake_machine_hand_certification_is_rejected() -> None:
    with tempfile.TemporaryDirectory() as directory:
        video = Path(directory) / "master.mp4"
        video.write_bytes(b"exact-master-bytes" * 100)
        digest = qc.sha256(video)
        payload = base_qc(digest)
        payload["checks"]["hands"] = {"status": "PASS", "score": 1.0}
        try:
            qc.evaluate(
                video=video,
                qc_payload=payload,
                vbench2_payload=good_vbench2(),
                vbench2_sha="1" * 64,
                i2v_payload=good_i2v(),
                i2v_sha="2" * 64,
            )
        except RuntimeError as error:
            assert "FALSE_FINE_DETAIL_MACHINE_CERTIFICATION:hands" in str(error)
        else:
            raise AssertionError("fake hand machine certification must fail")


def main() -> None:
    tests = [
        test_dimension_score_accepts_vbench_tuple_shape,
        test_good_scores_pass_and_stay_byte_bound,
        test_low_anatomy_fails,
        test_wrong_video_digest_is_rejected,
        test_fake_machine_hand_certification_is_rejected,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print("AVANTIQO_INVESTOR_HUMAN_VBENCH_QC_TESTS=PASS")


if __name__ == "__main__":
    main()
