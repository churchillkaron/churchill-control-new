"""Static production gate for the investor-film voice/visual source of truth.

This does not judge image quality. It makes the editorial contract fail closed:
continuous timing, semantic voice proof, bounded shot duration, real UI evidence,
and explicit human-release dependency must all be declared before picture lock.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

CONTRACT = "AVANTIQO_INVESTOR_VOICE_VISUAL_BEAT_MAP_GATE_V1"
BEAT_MAP_CONTRACT = "AVANTIQO_INVESTOR_VOICE_VISUAL_BEAT_MAP_V1"
SOURCE_REPOSITORY = "churchillkaron/churchill-control-new"
HUMAN_RELEASE_CONTRACT = "AVANTIQO_INVESTOR_HUMAN_RELEASE_V1"
EXPECTED_DURATION = 60.0
MIN_BEAT_SECONDS = 3.0
MAX_BEAT_SECONDS = 6.0
EPSILON = 0.001

REQUIRED_BEAT_FIELDS = (
    "id",
    "time",
    "voice",
    "meaning",
    "primary_visual",
    "source_shot",
    "avantiqo_action",
    "camera_and_edit",
    "transition_out",
    "proof",
)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _obj(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _fail(condition: bool, code: str, failures: list[str]) -> None:
    if not condition:
        failures.append(code)


def evaluate(data: dict[str, Any]) -> dict[str, Any]:
    failures: list[str] = []
    _fail(data.get("contract") == BEAT_MAP_CONTRACT, "beat_map:contract_invalid", failures)
    _fail(data.get("source_repository") == SOURCE_REPOSITORY, "beat_map:repository_invalid", failures)
    _fail(data.get("status") == "PRODUCTION_SOURCE_OF_TRUTH", "beat_map:not_authoritative", failures)

    film = _obj(data.get("film"))
    _fail(abs(float(film.get("target_duration_seconds") or 0.0) - EXPECTED_DURATION) <= EPSILON,
          "film:duration_invalid", failures)
    _fail(_text(film.get("editing_rule")) != "", "film:editing_rule_required", failures)
    _fail(_text(film.get("anti_boring_rule")) != "", "film:anti_boring_rule_required", failures)

    rules = _obj(data.get("global_release_rules"))
    _fail(rules.get("voice_visual_semantic_mismatch_forbidden") is True,
          "rules:semantic_mismatch_must_fail", failures)
    _fail(rules.get("static_dashboard_exposition_forbidden") is True,
          "rules:static_dashboard_must_fail", failures)
    _fail(rules.get("ui_must_show_real_avantiqo_state") is True,
          "rules:real_ui_required", failures)
    _fail(rules.get("generated_human_release_contract") == HUMAN_RELEASE_CONTRACT,
          "rules:human_release_contract_invalid", failures)
    _fail(rules.get("generated_human_release_must_be_authorized") is True,
          "rules:human_release_authorization_required", failures)

    beats = data.get("beats")
    _fail(isinstance(beats, list) and bool(beats), "beats:required", failures)
    previous_end = 0.0
    seen_ids: set[str] = set()
    human_beats = 0
    ui_beats = 0

    if isinstance(beats, list):
        for index, raw in enumerate(beats):
            beat = _obj(raw)
            prefix = f"beat:{index}"
            for field in REQUIRED_BEAT_FIELDS:
                value = beat.get(field)
                _fail(value is not None and (field == "time" or bool(_text(value))),
                      f"{prefix}:{field}:required", failures)

            beat_id = _text(beat.get("id"))
            _fail(bool(beat_id), f"{prefix}:id:required", failures)
            _fail(beat_id not in seen_ids, f"{prefix}:id:duplicate:{beat_id}", failures)
            seen_ids.add(beat_id)

            timing = _obj(beat.get("time"))
            try:
                start = float(timing.get("start"))
                end = float(timing.get("end"))
            except (TypeError, ValueError):
                failures.append(f"{prefix}:time:invalid")
                continue
            duration = end - start
            _fail(abs(start - previous_end) <= EPSILON, f"{prefix}:timeline_gap_or_overlap", failures)
            _fail(duration >= MIN_BEAT_SECONDS - EPSILON, f"{prefix}:too_short", failures)
            _fail(duration <= MAX_BEAT_SECONDS + EPSILON, f"{prefix}:too_long", failures)
            _fail(end > start, f"{prefix}:non_positive_duration", failures)
            previous_end = end

            _fail(len(_text(beat.get("voice")).split()) >= 3, f"{prefix}:voice_too_thin", failures)
            _fail(len(_text(beat.get("proof"))) >= 12, f"{prefix}:proof_too_thin", failures)
            _fail(len(_text(beat.get("primary_visual"))) >= 20, f"{prefix}:visual_too_thin", failures)

            action = _text(beat.get("avantiqo_action")).lower()
            if action not in {"none", "none yet"} and "none;" not in action:
                ui_beats += 1

            if beat.get("human_release_required") is True:
                human_beats += 1

    _fail(abs(previous_end - EXPECTED_DURATION) <= EPSILON, "timeline:must_end_at_60_seconds", failures)
    _fail(len(seen_ids) >= 12, "timeline:insufficient_semantic_beats", failures)
    _fail(human_beats >= 6, "timeline:human_reality_underrepresented", failures)
    _fail(ui_beats >= 6, "timeline:product_proof_underrepresented", failures)

    checks = data.get("picture_lock_checks")
    _fail(isinstance(checks, list) and len(checks) >= 8, "picture_lock:checks_incomplete", failures)

    return {
        "success": not failures,
        "contract": CONTRACT,
        "beat_map_contract": BEAT_MAP_CONTRACT,
        "source_repository": SOURCE_REPOSITORY,
        "timeline_duration_seconds": previous_end,
        "beat_count": len(beats) if isinstance(beats, list) else 0,
        "human_release_bound_beat_count": human_beats,
        "product_proof_beat_count": ui_beats,
        "picture_lock_authorized_by_static_contract": not failures,
        "visual_quality_release_still_required": True,
        "human_release_contract": HUMAN_RELEASE_CONTRACT,
        "failures": failures,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--beat-map", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    beat_map_path = Path(args.beat_map).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()
    if not beat_map_path.is_file():
        raise SystemExit(f"{CONTRACT}_BEAT_MAP_MISSING")
    result = evaluate(json.loads(beat_map_path.read_text(encoding="utf-8")))
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    if not result["success"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
