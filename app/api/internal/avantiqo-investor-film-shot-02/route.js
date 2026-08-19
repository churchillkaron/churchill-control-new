export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";

const SHOT = {
  title: "Avantiqo investor film — Shot 02 — Fragmented Systems",
  description:
    "A world-class photoreal cinematic enterprise film shot continuing directly from the previous opening scene. Stay in the same refined practical office overlooking an active hospitality or multi-business operation through glass. The same type of credible hands-on international business owner/operator, around 40 to 50 years old, is now seated at the desk. Frame him tighter from behind and slightly over one shoulder so the performance reads as continuous while his face remains mostly in profile or partially obscured. The laptop is open directly in front of him, a smartphone is in one hand, and a second device or printed operational note sits beside the laptop. He looks at the laptop, immediately checks the phone, then compares or glances toward the second source before returning attention to the laptop while still holding the phone. His movements are a little quicker than in the opening shot but remain controlled, professional and believable. The visual idea is unmistakable: every piece of business information lives somewhere different, and the owner is manually reconciling it. The camera performs a restrained slow push closer throughout the five-second shot. No dialogue, no generated voice-over, no music; only subtle office ambience and restrained device notification sounds.",
  intent: {
    story_purpose:
      "Make the fragmentation problem visually explicit: the operator has to compare separate sources because sales, operations and finance do not share one context.",
    emotional_tone:
      "premium, intelligent, human, credible, increasingly interrupted but never panicked or theatrical",
    story_state_change:
      "the operator moves from receiving interruptions to actively comparing disconnected information sources himself",
  },
  continuity: {
    relationship_to_previous_shot:
      "direct continuation from Shot 01; same office mood, same practical styling, same owner/operator archetype, tighter over-shoulder coverage so identity continuity is protected",
    wardrobe:
      "understated smart-casual dark neutral business workwear matching the previous scene",
    environment:
      "same quiet refined office with glass overlooking a live operation",
  },
  requirements: {
    visual_quality:
      "world-class photoreal premium enterprise technology commercial with feature-film production value",
    realism:
      "natural human movement, realistic anatomy, believable physics, real-world wardrobe and props, refined practical lighting, no synthetic beauty treatment",
    camera_language:
      "tight over-shoulder three-quarter composition, restrained depth of field, subtle slow push-in, stable device geometry, no handheld shake",
    subject:
      "credible hands-on international business owner/operator aged approximately 40 to 50; keep face mostly profile, rear-three-quarter or partially obscured to preserve continuity across separately generated shots",
    action:
      "look at laptop, immediately check smartphone, glance toward second device or printed operational note, then return attention to laptop while still holding phone",
    composition:
      "laptop centered in working zone, smartphone clearly visible in one hand, second information source visible beside laptop; camera close enough to make eye-line switching unmistakable",
    lighting:
      "same warm premium practical office light with natural daylight from the operation beyond glass, restrained cinematic contrast, realistic skin tones",
    screen_policy:
      "EVERY visible phone, tablet, laptop or monitor must remain deep charcoal to near-black with subtle low-contrast dark placeholder blocks only. Absolutely no white interface, no bright browser page, no readable generated software text, no invented logos, no colorful generic dashboard and no fake Avantiqo UI. Keep device screens stable and perspective-friendly for later editorial replacement if required.",
    audio_policy:
      "ambient office and distant operational room tone with restrained notification cues only; no dialogue, no voice-over and no music",
    negative_constraints: [
      "no white device screens",
      "no fake software interfaces",
      "no readable generated UI text",
      "no invented logos",
      "no floating notifications or holograms",
      "no sci-fi graphics",
      "no exaggerated frustration",
      "no panicked acting",
      "no cheesy corporate gestures",
      "no smiling at camera",
      "no warped hands",
      "no distorted phones or laptop",
      "no synthetic skin",
      "no camera shake",
      "no text overlays",
    ],
  },
  editorial: {
    voiceover_reference:
      "Sales in one place. Operations in another. Finance somewhere else.",
    visual_message:
      "the human operator is the current integration layer",
  },
  screen_replacement: {
    avantiqo_workspace: "none; this is still the problem section before the Avantiqo reveal",
    replacement_window: "approximately seconds 0.5 to 4.7",
  },
  frame_contract: {
    opening:
      "tight over-shoulder view: operator at laptop with dark screen, smartphone already within reach, second information source visible nearby",
    progression:
      "operator switches attention laptop to phone to second source with increasingly efficient but visibly manual comparison behavior",
    closing:
      "operator faces laptop again while still holding phone, visually trapped between multiple information sources",
  },
  output_spec: {
    duration_seconds: 5,
    aspect_ratio: "16:9",
  },
  provider_parameters: {
    aspect_ratio: "16:9",
  },
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const result = await executeService({
      organization_id: ORGANIZATION_ID,
      bill_to_organization_id: ORGANIZATION_ID,
      entity_id: ENTITY_ID,
      service_id: "ai.video.generate",
      provider_id: "gemini",
      input: {
        ...SHOT,
        quantity: SHOT.output_spec.duration_seconds,
        currency: "THB",
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_FILM_SHOT_02",
        brand: "Avantiqo",
        source: "avantiqo_investor_film_shot_02_20260819_v1",
        provider_priority: ["gemini", "google-veo", "runway"],
        screen_replacement: SHOT.screen_replacement,
      },
      category: "AI",
    });

    const output = result?.output || null;
    const providerOutput = output?.output || {};
    const interactionId =
      result?.interaction_id ||
      output?.interaction_id ||
      providerOutput?.interaction_id ||
      null;

    return json({
      success: true,
      shot: "02",
      title: SHOT.title,
      pending: result?.pending ?? null,
      provider: result?.provider || null,
      model: result?.model || null,
      provider_job_id: result?.provider_job_id || null,
      provider_status: result?.provider_status || null,
      interaction_id: interactionId,
      usage_id: result?.usage?.id || null,
      credential_id: result?.credential_id || null,
      pricing: result?.pricing || null,
      started_at: result?.started_at || null,
      output,
    });
  } catch (error) {
    return json(
      {
        success: false,
        error: error?.message || String(error),
      },
      500,
    );
  }
}
