import copy
import hashlib
import json
from typing import Any, Optional, Tuple

CONTRACT = "CREATIVE_STILL_PREVISUALIZATION_BLUEPRINT_V1"
COMPILER_CONTRACT = "AVANTIQO_IMAGE_STILL_BLUEPRINT_COMPILER_V1"
MAX_INSTRUCTION_LENGTH = 12000


def _text(value: Any) -> str:
    return str(value or "").strip()


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _digest(payload: dict[str, Any]) -> str:
    canonical = {"contract": CONTRACT, "payload": payload}
    return hashlib.sha256(_canonical_json(canonical).encode("utf-8")).hexdigest()

def _verified_blueprint(value: Any) -> Optional[dict[str, Any]]:
    blueprint = _object(value)
    if not blueprint:
        return None
    if blueprint.get("contract") != CONTRACT:
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_CONTRACT_INVALID")
    if blueprint.get("passed") is not True:
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_PASS_REQUIRED")
    if blueprint.get("zero_provider_calls") is not True:
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_PROVIDER_BOUNDARY_INVALID")
    if blueprint.get("zero_media_generation") is not True:
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_MEDIA_BOUNDARY_INVALID")
    if blueprint.get("paid_generation_authority") is not False:
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_AUTHORITY_INVALID")
    payload = _object(blueprint.get("payload"))
    supplied = _text(blueprint.get("blueprint_digest"))
    if not supplied or supplied != _digest(payload):
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_DIGEST_INVALID")
    return blueprint


def _zone_sentence(zone: dict[str, Any]) -> str:
    role = _text(zone.get("role")).upper() or "CONTENT"
    return (
        f"{role} zone x={float(zone.get('x', 0)):.3f}, "
        f"y={float(zone.get('y', 0)):.3f}, "
        f"w={float(zone.get('width', 0)):.3f}, "
        f"h={float(zone.get('height', 0)):.3f}."
    )

def _compiled_instruction(base_instruction: str, payload: dict[str, Any]) -> str:
    zones = payload.get("zones") if isinstance(payload.get("zones"), list) else []
    zone_lines = [_zone_sentence(_object(zone)) for zone in zones if isinstance(zone, dict)]
    constraints = _object(payload.get("generation_constraints"))
    deterministic = _object(payload.get("deterministic_layers"))
    canvas = _object(payload.get("canvas"))

    rules = [
        "Avantiqo still composition authority:",
        f"Canvas orientation={_text(canvas.get('orientation')) or 'UNSPECIFIED'}, "
        f"aspect={_text(canvas.get('aspect_ratio')) or 'UNSPECIFIED'}.",
        *zone_lines,
        "Use generated pixels only for visual material, photography, illustration, environment, texture, objects and scene content.",
        "Keep NEGATIVE_SPACE zones visually quiet and usable for downstream deterministic design layers.",
        "Place the primary subject inside the HERO zone and preserve intentional focal hierarchy.",
    ]
    if constraints.get("typography_generated_in_pixels") is False or deterministic.get("typography") is True:
        rules.append("Do not generate readable typography, headlines, captions or body copy into the image.")
    if constraints.get("logo_generated_in_pixels") is False or deterministic.get("logo") is True:
        rules.append("Do not generate, redraw or approximate logos or brand marks into the image.")
    if constraints.get("business_data_generated_in_pixels") is False:
        rules.append("Do not generate prices, dates, tables, QR codes, legal copy or business facts into the image.")
    rules.append("The downstream design engine will add all exact text, logos, data and codes deterministically.")

    compiled = f"{base_instruction.strip()}\n\n" + " ".join(rules)
    if len(compiled) > MAX_INSTRUCTION_LENGTH:
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_COMPILED_INSTRUCTION_TOO_LONG")
    return compiled

def compile_still_blueprint_job(job: dict[str, Any]) -> Tuple[dict[str, Any], Optional[dict[str, Any]]]:
    prepared = copy.deepcopy(job)
    data = _object(prepared.get("input"))
    structured = _object(data.get("structured_specification"))
    requirements = _object(structured.get("requirements"))
    blueprint = _verified_blueprint(requirements.get("still_previsualization_blueprint"))
    if blueprint is None:
        return job, None

    capability = _text(data.get("capability")).lower()
    if not capability.startswith("ai.image."):
        raise ValueError("AVANTIQO_IMAGE_STILL_BLUEPRINT_IMAGE_CAPABILITY_REQUIRED")

    base_instruction = _text(data.get("instruction"))
    if not base_instruction:
        raise ValueError("AVANTIQO_IMAGE_INSTRUCTION_REQUIRED")
    payload = _object(blueprint.get("payload"))
    data["instruction"] = _compiled_instruction(base_instruction, payload)
    prepared["input"] = data

    zones = payload.get("zones") if isinstance(payload.get("zones"), list) else []
    return prepared, {
        "contract": COMPILER_CONTRACT,
        "still_blueprint_contract": CONTRACT,
        "still_blueprint_digest": blueprint.get("blueprint_digest"),
        "zone_count": len(zones),
        "zone_roles": [_text(_object(zone).get("role")).upper() for zone in zones],
        "negative_space_preserved": any(_text(_object(zone).get("role")).upper() == "NEGATIVE_SPACE" for zone in zones),
        "hero_zone_applied": any(_text(_object(zone).get("role")).upper() == "HERO" for zone in zones),
        "deterministic_text_layer_preserved": True,
        "deterministic_logo_layer_preserved": True,
        "compiled_instruction_persisted": False,
        "raw_reasoning_persisted": False,
    }
