from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE = ROOT / "services/avantiqo-video-engine/investor_human_qc_pack.py"
spec = importlib.util.spec_from_file_location("investor_human_qc_pack", MODULE)
if spec is None or spec.loader is None:
    raise RuntimeError("INVESTOR_HUMAN_QC_PACK_IMPORT_FAILED")
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)


def test_timestamps_span_clip_without_touching_edges() -> None:
    points = qc.sample_timestamps(4.0)
    assert len(points) == qc.SAMPLE_COUNT
    assert points == sorted(points)
    assert len(set(points)) == qc.SAMPLE_COUNT
    assert 0.0 < points[0] < 0.2
    assert 3.8 < points[-1] < 4.0


def test_automated_qc_starts_pending() -> None:
    digest = "a" * 64
    payload = qc.pending_automated_qc(digest)
    assert payload["status"] == "PENDING"
    assert payload["video_sha256"] == digest
    assert payload["sampled_frames"] == qc.SAMPLE_COUNT
    assert set(payload["checks"]) == set(qc.REQUIRED_CHECKS)
    assert all(item["status"] == "PENDING" for item in payload["checks"].values())
    assert all(item["score"] is None for item in payload["checks"].values())


def test_visual_review_starts_pending_and_byte_bound() -> None:
    video = "b" * 64
    sheet = "c" * 64
    payload = qc.pending_visual_review(video, sheet)
    assert payload["status"] == "PENDING"
    assert payload["video_sha256"] == video
    assert payload["contact_sheet_sha256"] == sheet
    assert payload["reviewer_id"] is None
    assert payload["reviewed_at"] is None
    assert set(payload["dimensions"]) == set(qc.VISUAL_DIMENSIONS)
    assert all(value == "PENDING" for value in payload["dimensions"].values())


def main() -> None:
    tests = [
        test_timestamps_span_clip_without_touching_edges,
        test_automated_qc_starts_pending,
        test_visual_review_starts_pending_and_byte_bound,
    ]
    for test in tests:
        test()
        print(f"PASS {test.__name__}")
    print("AVANTIQO_INVESTOR_HUMAN_QC_PACK_TESTS=PASS")


if __name__ == "__main__":
    main()
