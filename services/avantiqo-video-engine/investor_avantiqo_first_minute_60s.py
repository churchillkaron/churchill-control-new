"""Generate the first 60 seconds of the Avantiqo investor film as 10 fresh 6s shots.

Direction: premium live-action cinema, multiple industries, invisible intelligence,
and a Creative Studio payoff. No sci-fi visual language and no product screenshots.
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import modal

CONTRACT = "AVANTIQO_INVESTOR_FIRST_MINUTE_60S_V1"
APP_NAME = "avantiqo-video-owned"
FUNCTION_NAME = "generate_investor_t2v_master"
REMOTE_ROOT = "investor-avantiqo-first-minute-60s"
DURATION_SECONDS = 6
EXPECTED_PIPELINE = "DISTILLED_TWO_STAGE_T2V_BF16"
EXPECTED_WIDTH = 1920
EXPECTED_HEIGHT = 1088
EXPECTED_FPS = 24

REALISM = (
    " Premium feature-film commercial realism photographed with real actors in real locations. "
    "Everything visible must be physically buildable and ordinary to touch today. Show sophistication through architecture, materials, human choreography, timing and calm execution rather than visible technology. "
    "Use natural skin texture, authentic hands, practical light, warm highlights, controlled shadows, layered foreground depth, motivated camera movement and believable professional workwear. "
    "ABSOLUTELY NO holograms, floating graphics, transparent displays, projected interfaces, glowing data panels, robots, androids, drones visible in frame, fantasy machines, blue neon, cyberpunk styling, sci-fi props, computer monitors, laptops, tablets, phones, dashboards, browser windows, generated words, fake logos, paper, folders, clipboards, staged meetings or stock-photo smiles. "
    "Do not make the scene look futuristic. If intelligence is present in the story, keep it invisible. Protect cinematic composition and photoreal faces."
)

SHOTS = (
    {
        "id": "01-city-dawn",
        "seed": 26090651,
        "prompt": (
            "A breathtaking dawn aerial over a prosperous tropical coastal city just waking up: hotels, restaurants, office towers, construction cranes and service vehicles beginning their day. The camera starts high and glides forward, then begins a deliberate descending move toward one elegant mixed-use business district. Golden early sunlight, humid atmospheric depth, real traffic, real architecture, no fantasy skyline. The shot should feel like the opening of an expensive international feature film." + REALISM
        ),
    },
    {
        "id": "02-descent-hotel",
        "seed": 26090652,
        "prompt": (
            "Continue the cinematic descent toward a premium urban hotel and transition from exterior scale into human-scale operation. Start outside the architecture, move downward past warm stone, glass and planting, then finish near an open hotel entrance where staff are naturally beginning service. The move must feel like a sophisticated crane or drone-to-gimbal handoff, smooth and physically plausible, ending inside the lived business rather than on a facade." + REALISM
        ),
    },
    {
        "id": "03-hotel-truth",
        "seed": 26090653,
        "prompt": (
            "Inside a beautiful hotel room just before guest arrival, a professional housekeeper finishes a precise room reset while another staff member passes in the corridor beyond. She checks the air from a circular ceiling vent, notices the cooling is wrong, pauses for half a beat and looks toward the doorway with quiet professional concern. No panic and no device. One elegant lateral move shifts from the prepared room to the airflow check and her reaction. End with the circular vent prominent enough to motivate a match cut." + REALISM
        ),
    },
    {
        "id": "04-field-service",
        "seed": 26090654,
        "prompt": (
            "Open on a close view of a real service-vehicle wheel in motion, echoing the circular shape from the previous scene, then widen as a professional pest-control field technician arrives at a tropical commercial property. The technician steps out, opens the vehicle, takes compact real field equipment and walks with purpose toward the site. Low moving camera, bright natural morning, believable uniform and equipment, no hazmat exaggeration. End as the technician passes very close across the lens to create a natural body wipe." + REALISM
        ),
    },
    {
        "id": "05-construction",
        "seed": 26090655,
        "prompt": (
            "Begin with a human figure passing close across the lens, then reveal a large active construction site where a project supervisor continues the same forward movement through real crews and materials. The supervisor watches a lift place a structural element while workers coordinate around it. Camera tracks beside them with restrained handheld weight and strong architectural parallax. Dust, sunlight, steel, concrete and real safety wear. Finish as a long metal element crosses the frame edge-to-edge for a motivated match cut." + REALISM
        ),
    },
    {
        "id": "06-restaurant-rhythm",
        "seed": 26090656,
        "prompt": (
            "A metal edge crosses frame and becomes the polished edge of a premium restaurant pass at the beginning of service. The kitchen comes alive: controlled flame from a pan, chef plating, server lifting a finished dish, guests arriving in layered background depth. The camera moves with energetic but disciplined feature-film rhythm, alternating macro food texture and human motion inside one coherent shot. Rich warm practical light, steam, glass, stainless steel and natural faces. Expensive hospitality campaign quality, never generic food advertising." + REALISM
        ),
    },
    {
        "id": "07-business-partner-decision",
        "seed": 26090657,
        "prompt": (
            "At the edge of the active restaurant floor, the owner-manager watches the room fill and notices that meaningful capacity remains. The sound and movement continue around them, but the performance becomes focused and deliberate. They quietly speak one short question to an unseen voice assistant without holding any device, listen for a beat, then make one small confident approving nod toward the operation. Slow controlled push-in, foreground staff briefly occlude frame, intelligence implied only through human timing and confidence." + REALISM
        ),
    },
    {
        "id": "08-studio-food-campaign",
        "seed": 26090658,
        "prompt": (
            "This is the first piece of a world-class campaign film created for the restaurant: extreme cinematic food and hospitality beauty. Macro close-up of a flame-kissed premium dish being finished with exquisite texture, a bartender cutting a clean citrus twist over a crystal cocktail, condensation and warm specular highlights, elegant slow-motion accents, luxury editorial lighting, precise camera movement and rich tactile detail. It must look like work from an elite global creative agency, not software advertising. No text or logos." + REALISM
        ),
    },
    {
        "id": "09-studio-experience-campaign",
        "seed": 26090659,
        "prompt": (
            "Second piece of the same premium campaign: stylish guests enter a beautiful evening hospitality venue as live entertainment begins, warm architectural light, movement through a lively room, close human details, laughter, glass, fabric, performance energy and sophisticated nightlife atmosphere without neon excess. Camera sweeps from an intimate foreground moment into a wider emotional reveal. Fashion-film confidence, cinematic motion, natural people, premium brand-film spectacle. No text or logos." + REALISM
        ),
    },
    {
        "id": "10-real-result",
        "seed": 26090660,
        "prompt": (
            "Return to the real restaurant later in service. The room is now convincingly full, staff move with calm precision, kitchen and floor operate in rhythm, and the same owner-manager watches the result for one quiet beat before returning attention to guests. The camera slowly pulls back through layered foreground movement so the business feels alive, profitable and under control. End on real people and real work, not technology. This is the commercial consequence of the intelligence and creative campaign shown before." + REALISM
        ),
    },
)


def _assert_generation(result: dict, shot_id: str) -> None:
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError(f"{CONTRACT}_SHOT_FAILED:{shot_id}:{result}")
    expected = {
        "pipeline": EXPECTED_PIPELINE,
        "width": EXPECTED_WIDTH,
        "height": EXPECTED_HEIGHT,
        "fps": EXPECTED_FPS,
        "duration_seconds_requested": DURATION_SECONDS,
        "stage_1_steps": 8,
        "stage_2_steps": 3,
        "source_visual_asset_count": 0,
        "source_image_used": False,
        "source_video_used": False,
        "screenshot_or_browser_capture_used": False,
        "pure_text_to_video": True,
        "newly_generated_asset": True,
        "external_provider_contacted": False,
        "automatic_paid_retry": False,
    }
    for key, value in expected.items():
        if result.get(key) != value:
            raise RuntimeError(f"{CONTRACT}_SHOT_EVIDENCE_INVALID:{shot_id}:{key}:{result.get(key)!r}:{value!r}")


def main() -> None:
    commit = os.environ.get("GITHUB_SHA") or "local"
    report_path = Path(os.environ.get("AVANTIQO_FIRST_MINUTE_GENERATION_REPORT") or "first-minute-60s-generation.json")
    remote_root = f"{REMOTE_ROOT}/{commit}"
    generator = modal.Function.from_name(APP_NAME, FUNCTION_NAME).with_options(
        max_containers=5,
        timeout=480,
        scaledown_window=5,
    )
    pending = []
    for shot in SHOTS:
        remote_path = f"{remote_root}/{shot['id']}-1920x1088.mp4"
        call = generator.spawn(remote_path, shot["prompt"], DURATION_SECONDS, shot["seed"])
        pending.append((shot, remote_path, call))
        print(f"{CONTRACT}_STARTED={shot['id']}:{call.object_id}", flush=True)

    completed = []
    for shot, remote_path, call in pending:
        result = call.get()
        _assert_generation(result, shot["id"])
        completed.append({
            "id": shot["id"], "seed": shot["seed"], "duration_seconds": DURATION_SECONDS,
            "remote_path": remote_path, "prompt": shot["prompt"], "generation": result,
        })
        print(f"{CONTRACT}_SHOT_PASS={shot['id']}:{result.get('modal_function_seconds')}", flush=True)

    report = {
        "success": True,
        "contract": CONTRACT,
        "source_commit": commit,
        "direction": "MULTI_INDUSTRY_REAL_CINEMA_WITH_STUDIO_PROOF",
        "shot_count": len(completed),
        "timeline_duration_seconds": len(completed) * DURATION_SECONDS,
        "generation_parallelism_requested": 5,
        "source_visual_asset_count": 0,
        "screenshots_used": False,
        "product_ui_used": False,
        "paper_or_documents_requested": False,
        "science_fiction_styling_requested": False,
        "visible_speculative_technology_requested": False,
        "creative_studio_proof_included": True,
        "external_video_provider_used": False,
        "automatic_paid_retry": False,
        "shots": completed,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"{CONTRACT}=PASS", flush=True)


if __name__ == "__main__":
    main()
