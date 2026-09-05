from __future__ import annotations

import json
import os
from pathlib import Path

import modal

CONTRACT = "AVANTIQO_INVESTOR_FIRST_MINUTE_PHOTOREAL_KEYFRAMES_V1"
APP_NAME = "avantiqo-image-owned"
FUNCTION_NAME = "generate_investor_keyframe"
REMOTE_ROOT = "investor-first-minute-photoreal-keyframes"
WIDTH = 1920
HEIGHT = 1088

COMMON = (
    " Real location photography, not concept art. Documentary-level realism with feature-film lighting. "
    "Natural imperfect skin, believable anatomy, real-world materials, asymmetry, subtle clutter appropriate to the workplace, ordinary practical lighting, realistic lens behavior, restrained color, no glamour retouching. "
    "No visible computer screens, no phones, no tablets, no holograms, no futuristic architecture, no robots, no paper, no signage, no generated text, no logos. "
    "The frame must plausibly be mistaken for a still photograph captured on a professional cinema camera in a real operating business."
)

SHOTS = (
    ("01-city-dawn", 26090701, "High-altitude dawn aerial photograph over a real prosperous tropical coastal city. Dense ordinary urban fabric, hotels, restaurants, offices, a few real construction cranes, service vehicles, humid atmospheric depth, golden early sunlight, believable traffic and rooftops. No fantasy skyline, no impossible towers, no stylized city. The composition is cinematic but unmistakably photographic."),
    ("02-hotel-entry", 26090702, "Street-to-entrance view of a premium real hotel in a tropical city at morning. Warm stone, glass, planting, luggage trolley, a couple of staff beginning service, one arriving guest in the distance. Elegant but entirely contemporary, lived-in and physically plausible. Human figures are secondary to architecture so faces remain natural."),
    ("03-hotel-housekeeping", 26090703, "Inside a real premium hotel room moments before guest arrival. One experienced housekeeper in practical uniform stands beside a neatly made bed and reaches up to test airflow from a simple ceiling vent, noticing that cooling feels wrong. Natural concentration, no posing. Real linen texture, imperfect room details, morning window light, realistic proportions and hands."),
    ("04-field-service", 26090704, "Real pest-control field technician arriving at a tropical commercial property beside a clean white service vehicle. Practical dark work uniform, compact sprayer and inspection bag, ordinary footwear, realistic posture. The technician is mid-step and focused on work rather than camera. Real pavement, vegetation and building textures, bright natural morning light."),
    ("05-construction", 26090705, "Real active construction site in daylight. A project supervisor in ordinary safety helmet and work clothes walks beside workers while a crane positions a real structural element. Concrete, steel, dust, cables and imperfect site organization. Documentary construction photography with strong depth and believable scale, no heroic posing."),
    ("06-restaurant-kitchen", 26090706, "Real premium restaurant kitchen during service. Chef at the pass finishing a dish while another cook works behind, stainless steel, steam, warm practical light, imperfect but clean working surfaces. People are actually working, not posing. Natural faces and hands, shallow depth of field, documentary hospitality photography."),
    ("07-owner-decision", 26090707, "Real restaurant owner-manager standing at the edge of an active dining room, quietly watching service and thinking. Staff cross naturally in foreground, occupied tables softly out of focus behind. The manager looks like a real operator under mild pressure, not a model. No device in hand. Warm practical restaurant light, subtle expression, cinematic but natural."),
    ("09-evening-experience", 26090709, "Real premium evening hospitality venue with a mixed-age group of genuine-looking guests entering and socializing while live entertainment begins in the background. Warm architectural lighting, real glassware, fabric and skin texture, slight motion in the room, candid expressions, no nightclub neon, no staged influencer posing."),
    ("10-real-result", 26090710, "Real restaurant later in a busy successful service. Tables convincingly occupied, staff moving with calm precision, kitchen pass active in the background, same owner-manager observing for a quiet second before returning attention to guests. Candid documentary feel, natural crowd variation, no duplicated faces, no visible devices."),
)


def main() -> None:
    commit = os.environ.get("GITHUB_SHA") or "local"
    report_path = Path(os.environ.get("AVANTIQO_KEYFRAME_REPORT") or "keyframe-report.json")
    remote_root = f"{REMOTE_ROOT}/{commit}"
    fn = modal.Function.from_name(APP_NAME, FUNCTION_NAME).with_options(max_containers=3, timeout=1200, scaledown_window=5)
    pending = []
    for shot_id, seed, prompt in SHOTS:
        relative = f"{remote_root}/{shot_id}.png"
        call = fn.spawn(relative, prompt + COMMON, WIDTH, HEIGHT, seed)
        pending.append((shot_id, seed, relative, call))
        print(f"{CONTRACT}_STARTED={shot_id}:{call.object_id}", flush=True)

    completed = []
    for shot_id, seed, relative, call in pending:
        result = call.get()
        if not isinstance(result, dict) or result.get("success") is not True:
            raise RuntimeError(f"{CONTRACT}_FAILED:{shot_id}:{result}")
        if result.get("width") != WIDTH or result.get("height") != HEIGHT:
            raise RuntimeError(f"{CONTRACT}_DIMENSION_INVALID:{shot_id}")
        if result.get("source_visual_asset_count") != 0 or result.get("external_provider_contacted") is not False:
            raise RuntimeError(f"{CONTRACT}_PROVENANCE_INVALID:{shot_id}")
        completed.append({"id": shot_id, "seed": seed, "remote_path": relative, "generation": result})
        print(f"{CONTRACT}_PASS={shot_id}", flush=True)

    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps({
        "success": True,
        "contract": CONTRACT,
        "source_commit": commit,
        "keyframe_count": len(completed),
        "food_shot_reused_from_previous_visual_pass": True,
        "animation_authorized": False,
        "human_visual_review_required": True,
        "shots": completed,
    }, indent=2) + "\n", encoding="utf-8")
    print(f"{CONTRACT}=PASS", flush=True)


if __name__ == "__main__":
    main()
