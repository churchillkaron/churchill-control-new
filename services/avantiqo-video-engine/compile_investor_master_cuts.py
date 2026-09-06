#!/usr/bin/env python3
"""Validate the Avantiqo investor master and compile deterministic domain edit manifests."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_INVESTOR_MASTER_FILM_V2"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate(data: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    if data.get("contract") != CONTRACT:
        failures.append("contract_invalid")
    if data.get("source_repository") != SOURCE_REPOSITORY:
        failures.append("source_repository_invalid")
    beats = data.get("beats") if isinstance(data.get("beats"), list) else []
    ids = [b.get("id") for b in beats if isinstance(b, dict)]
    if not beats:
        failures.append("beats_missing")
    if len(ids) != len(set(ids)):
        failures.append("beat_ids_not_unique")
    for idx, beat in enumerate(beats):
        if not isinstance(beat, dict):
            failures.append(f"beat_{idx}_invalid")
            continue
        bid = beat.get("id") or f"beat_{idx}"
        for field in ("chapter", "domains", "voice", "visual", "proof"):
            if not beat.get(field):
                failures.append(f"{bid}:{field}_missing")
        duration = beat.get("duration")
        if not isinstance(duration, (int, float)) or duration <= 0:
            failures.append(f"{bid}:duration_invalid")
    total = sum(float(b.get("duration", 0)) for b in beats if isinstance(b, dict))
    target = float(data.get("film", {}).get("target_duration_seconds", 0))
    if abs(total - target) > 0.01:
        failures.append(f"master_duration_mismatch:{total}:{target}")
    valid = set(ids)
    cuts = data.get("cutdowns") if isinstance(data.get("cutdowns"), dict) else {}
    for name, spec in cuts.items():
        include = spec.get("include") if isinstance(spec, dict) else None
        if not isinstance(include, list) or not include:
            failures.append(f"cut:{name}:include_missing")
            continue
        unknown = [bid for bid in include if bid not in valid]
        if unknown:
            failures.append(f"cut:{name}:unknown_beats:{','.join(unknown)}")
    return failures


def compile_cut(data: dict[str, Any], name: str) -> dict[str, Any]:
    cuts = data["cutdowns"]
    if name not in cuts:
        raise KeyError(name)
    wanted = cuts[name]["include"]
    by_id = {b["id"]: b for b in data["beats"]}
    beats = [by_id[bid] for bid in wanted]
    return {
        "contract": "AVANTIQO_INVESTOR_DOMAIN_CUT_V1",
        "source_repository": SOURCE_REPOSITORY,
        "source_master_contract": CONTRACT,
        "cut": name,
        "target_seconds": cuts[name].get("target_seconds"),
        "compiled_seconds": sum(float(b["duration"]) for b in beats),
        "beat_ids": wanted,
        "beats": beats,
        "rules": {
            "approved_master_assets_only": True,
            "regeneration_required": False,
            "preserve_audio_stems": True,
            "preserve_edit_handles": True,
            "generated_humans_require_exact_master_release": True
        }
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--cut", action="append")
    args = parser.parse_args()
    path = Path(args.manifest).resolve()
    data = load(path)
    failures = validate(data)
    if failures:
        print(json.dumps({"status": "FAIL", "failures": failures}, indent=2))
        raise SystemExit(1)
    out = Path(args.out_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    names = args.cut or list(data["cutdowns"].keys())
    compiled = []
    for name in names:
        try:
            result = compile_cut(data, name)
        except KeyError:
            raise SystemExit(f"UNKNOWN_CUT:{name}")
        target = out / f"investor-cut-{name}.json"
        target.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        compiled.append({"cut": name, "seconds": result["compiled_seconds"], "path": str(target)})
    print(json.dumps({"status": "PASS", "master_seconds": data["film"]["target_duration_seconds"], "cuts": compiled}, indent=2))


if __name__ == "__main__":
    main()
