"""Single governed entrypoint for Avantiqo investor human footage.

Lifecycle:
  approved source -> pending character variants -> explicitly approved keyframes
  -> protected multi-keyframe LTX master -> exact-master QC pack
  -> VBench machine evidence -> exact-master visual approval -> release gate

No stage auto-approves the next stage. All artifacts are byte-bound and all
provider execution remains in churchillkaron/churchill-control-new.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_INVESTOR_HUMAN_PROOF_PIPELINE_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"
ROOT = Path(__file__).resolve().parents[1]
CHARACTER_RUNTIME = ROOT / "services/avantiqo-image-engine/modal_character_keyframe_runtime.py"
HUMAN_RENDERER = ROOT / "services/avantiqo-video-engine/modal_human_multi_keyframe_render.py"
QC_PACK = ROOT / "services/avantiqo-video-engine/investor_human_qc_pack.py"
VBENCH_ADAPTER = ROOT / "services/avantiqo-video-engine/investor_human_vbench_qc.py"
RELEASE_GATE = ROOT / "services/avantiqo-video-engine/investor_human_release_gate.py"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    if not path.is_file():
        raise RuntimeError(f"{CONTRACT}_FILE_MISSING:{path}")
    return json.loads(path.read_text(encoding="utf-8"))


def obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def run(command: list[str]) -> None:
    completed = subprocess.run(command, cwd=str(ROOT), check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def modal_run(script: Path, args: list[str]) -> None:
    run(["modal", "run", str(script), *args])


def validate_approved_source(source: Path, approval_path: Path) -> dict[str, Any]:
    approval = obj(load_json(approval_path))
    if approval.get("status") != "APPROVED":
        raise RuntimeError(f"{CONTRACT}_SOURCE_NOT_APPROVED")
    if not str(approval.get("approval_id") or "").strip():
        raise RuntimeError(f"{CONTRACT}_SOURCE_APPROVAL_ID_REQUIRED")
    if not str(approval.get("character_id") or "").strip():
        raise RuntimeError(f"{CONTRACT}_SOURCE_CHARACTER_ID_REQUIRED")
    if approval.get("sha256") != sha256(source):
        raise RuntimeError(f"{CONTRACT}_SOURCE_DIGEST_MISMATCH")
    return approval


def validate_keyframe_manifest(path: Path) -> dict[str, Any]:
    manifest = obj(load_json(path))
    if str(manifest.get("source_repository") or SOURCE_REPOSITORY) != SOURCE_REPOSITORY:
        raise RuntimeError(f"{CONTRACT}_KEYFRAME_REPOSITORY_INVALID")
    keyframes = manifest.get("keyframes")
    if not isinstance(keyframes, list) or not 3 <= len(keyframes) <= 8:
        raise RuntimeError(f"{CONTRACT}_KEYFRAME_COUNT_INVALID")
    identities = set()
    frames: list[int] = []
    for index, item_raw in enumerate(keyframes):
        item = obj(item_raw)
        if item.get("status") != "APPROVED":
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_NOT_APPROVED:{index}")
        approval_id = str(item.get("approval_id") or "").strip()
        character_id = str(item.get("character_id") or "").strip()
        source_path = Path(str(item.get("source_path") or "")).expanduser().resolve()
        if not approval_id or not character_id:
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_APPROVAL_IDENTITY_REQUIRED:{index}")
        if not source_path.is_file():
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_SOURCE_MISSING:{index}")
        if str(item.get("sha256") or "").lower() != sha256(source_path):
            raise RuntimeError(f"{CONTRACT}_KEYFRAME_DIGEST_MISMATCH:{index}")
        frame = int(item.get("frame"))
        identities.add(character_id)
        frames.append(frame)
    if len(identities) != 1:
        raise RuntimeError(f"{CONTRACT}_SAME_IDENTITY_REQUIRED")
    if frames != sorted(set(frames)) or frames[0] != 0:
        raise RuntimeError(f"{CONTRACT}_KEYFRAME_FRAME_ORDER_INVALID")
    if not str(manifest.get("instruction") or "").strip():
        raise RuntimeError(f"{CONTRACT}_INSTRUCTION_REQUIRED")
    return manifest


def command_character(args: argparse.Namespace) -> None:
    source = Path(args.source).expanduser().resolve()
    approval = Path(args.source_approval).expanduser().resolve()
    if not source.is_file():
        raise RuntimeError(f"{CONTRACT}_SOURCE_MISSING")
    validate_approved_source(source, approval)
    output = Path(args.output).expanduser().resolve()
    modal_run(CHARACTER_RUNTIME, [
        "--source-path", str(source),
        "--source-approval-json", str(approval),
        "--output-path", str(output),
        "--instruction", args.instruction,
        "--seed", str(args.seed),
    ])
    print(f"{CONTRACT}=CHARACTER_VARIANT_PENDING_APPROVAL")


def command_render(args: argparse.Namespace) -> None:
    manifest = Path(args.manifest).expanduser().resolve()
    validate_keyframe_manifest(manifest)
    output = Path(args.output).expanduser().resolve()
    modal_run(HUMAN_RENDERER, [
        "--manifest", str(manifest),
        "--output", str(output),
        "--duration-seconds", str(args.duration_seconds),
        "--seed", str(args.seed),
    ])
    report = output.with_suffix(".json")
    if not output.is_file() or not report.is_file():
        raise RuntimeError(f"{CONTRACT}_RENDER_OUTPUT_MISSING")
    generation = obj(obj(load_json(report)).get("generation"))
    if generation.get("release_authorized") is not False:
        raise RuntimeError(f"{CONTRACT}_RENDER_SELF_AUTHORIZATION_FORBIDDEN")
    if generation.get("output_sha256") != sha256(output):
        raise RuntimeError(f"{CONTRACT}_RENDER_DIGEST_MISMATCH")
    print(f"{CONTRACT}=MASTER_QC_PENDING")


def command_qc_pack(args: argparse.Namespace) -> None:
    video = Path(args.video).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    run([
        sys.executable, str(QC_PACK),
        "--video", str(video),
        "--output-dir", str(output_dir),
    ])
    print(f"{CONTRACT}=MACHINE_AND_VISUAL_QC_PENDING")


def command_machine_qc(args: argparse.Namespace) -> None:
    run([
        sys.executable, str(VBENCH_ADAPTER),
        "--video", str(Path(args.video).expanduser().resolve()),
        "--qc", str(Path(args.qc).expanduser().resolve()),
        "--vbench2-results", str(Path(args.vbench2_results).expanduser().resolve()),
        "--i2v-results", str(Path(args.i2v_results).expanduser().resolve()),
        "--output", str(Path(args.output).expanduser().resolve()),
    ])
    print(f"{CONTRACT}=MACHINE_QC_PASS_VISUAL_REVIEW_PENDING")


def command_release(args: argparse.Namespace) -> None:
    video = Path(args.video).expanduser().resolve()
    render_report = obj(load_json(Path(args.render_report).expanduser().resolve()))
    automated_qc = obj(load_json(Path(args.automated_qc).expanduser().resolve()))
    visual_review = obj(load_json(Path(args.visual_review).expanduser().resolve()))
    generation = obj(render_report.get("generation"))
    video_sha = sha256(video)
    if generation.get("output_sha256") != video_sha:
        raise RuntimeError(f"{CONTRACT}_RELEASE_RENDER_DIGEST_MISMATCH")
    if automated_qc.get("video_sha256") != video_sha:
        raise RuntimeError(f"{CONTRACT}_RELEASE_MACHINE_QC_DIGEST_MISMATCH")
    if visual_review.get("video_sha256") != video_sha:
        raise RuntimeError(f"{CONTRACT}_RELEASE_VISUAL_REVIEW_DIGEST_MISMATCH")

    manifest = {
        "contract": "AVANTIQO_INVESTOR_HUMAN_RELEASE_V1",
        "source_repository": SOURCE_REPOSITORY,
        "clips": [{
            "id": args.clip_id,
            "contains_generated_human": True,
            "generation": generation,
            "automated_qc": automated_qc,
            "visual_review": visual_review,
        }],
    }
    manifest_path = Path(args.manifest_output).expanduser().resolve()
    report_path = Path(args.release_report).expanduser().resolve()
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run([
        sys.executable, str(RELEASE_GATE),
        "--manifest", str(manifest_path),
        "--report", str(report_path),
    ])
    report = obj(load_json(report_path))
    if report.get("release_authorized") is not True:
        raise RuntimeError(f"{CONTRACT}_RELEASE_NOT_AUTHORIZED")
    print(f"{CONTRACT}=RELEASE_AUTHORIZED")


def command_status(args: argparse.Namespace) -> None:
    workspace = Path(args.workspace).expanduser().resolve()
    names = {
        "master": workspace / "native-master.mp4",
        "render_report": workspace / "native-master.json",
        "qc_evidence": workspace / "qc/evidence.json",
        "machine_qc": workspace / "qc/automated-qc-scored.json",
        "visual_review": workspace / "qc/visual-review.json",
        "release_manifest": workspace / "release-manifest.json",
        "release_report": workspace / "release-report.json",
    }
    status = {name: path.is_file() for name, path in names.items()}
    status["release_authorized"] = False
    if names["release_report"].is_file():
        status["release_authorized"] = obj(load_json(names["release_report"])).get("release_authorized") is True
    print(json.dumps({
        "contract": CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "workspace": str(workspace),
        "artifacts": status,
    }, indent=2))


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser()
    sub = root.add_subparsers(dest="command", required=True)

    character = sub.add_parser("character")
    character.add_argument("--source", required=True)
    character.add_argument("--source-approval", required=True)
    character.add_argument("--output", required=True)
    character.add_argument("--instruction", required=True)
    character.add_argument("--seed", type=int, default=91827)
    character.set_defaults(func=command_character)

    render = sub.add_parser("render")
    render.add_argument("--manifest", required=True)
    render.add_argument("--output", required=True)
    render.add_argument("--duration-seconds", type=int, default=4)
    render.add_argument("--seed", type=int, default=91827)
    render.set_defaults(func=command_render)

    pack = sub.add_parser("qc-pack")
    pack.add_argument("--video", required=True)
    pack.add_argument("--output-dir", required=True)
    pack.set_defaults(func=command_qc_pack)

    machine = sub.add_parser("machine-qc")
    machine.add_argument("--video", required=True)
    machine.add_argument("--qc", required=True)
    machine.add_argument("--vbench2-results", required=True)
    machine.add_argument("--i2v-results", required=True)
    machine.add_argument("--output", required=True)
    machine.set_defaults(func=command_machine_qc)

    release = sub.add_parser("release")
    release.add_argument("--clip-id", required=True)
    release.add_argument("--video", required=True)
    release.add_argument("--render-report", required=True)
    release.add_argument("--automated-qc", required=True)
    release.add_argument("--visual-review", required=True)
    release.add_argument("--manifest-output", required=True)
    release.add_argument("--release-report", required=True)
    release.set_defaults(func=command_release)

    status = sub.add_parser("status")
    status.add_argument("--workspace", required=True)
    status.set_defaults(func=command_status)
    return root


def main() -> None:
    args = parser().parse_args()
    try:
        args.func(args)
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
