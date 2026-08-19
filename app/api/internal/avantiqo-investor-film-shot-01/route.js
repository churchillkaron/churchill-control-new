export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";

const SHOT = {
  title: "Avantiqo investor film — Shot 01 — The Operator Is the Integration Layer",
  description:
    "A world-class photoreal cinematic enterprise film opening. A believable international hands-on business owner/operator, around 40 to 50 years old, enters a refined practical office overlooking an active hospitality or multi-business operation through glass. He sits at his desk where a laptop, smartphone and one additional business device are already present. Almost immediately the smartphone gives a subtle physical vibration and soft notification tone, followed by a restrained second system alert from another device. He checks the phone, turns naturally toward the laptop, then another alert redirects his attention. His performance is calm, capable and slightly interrupted rather than stressed, frustrated or theatrical. He should feel like the human being forced to connect multiple systems in his head. The camera begins slightly behind and to the side of him and performs one slow, controlled cinematic push forward. Premium practical lighting, sophisticated feature-film restraint, realistic skin, wardrobe, physics and office detail. No dialogue, no generated voice-over, no music; ambient room tone and restrained device notification sounds only.",
  intent: {
    story_purpose:
      "Establish the investor-film problem in the first seconds: the operator has become the integration layer between disconnected business systems.",
    emotional_tone:
      "premium, intelligent, calm, human, operationally credible, subtly overloaded without melodrama",
    story_state_change:
      "the operator moves from beginning normal work to being pulled between several disconnected sources of information",
  },
  requirements: {
    visual_quality:
      "world-class photoreal premium enterprise technology commercial with feature-film production value",
    realism:
      "natural human movement, realistic anatomy, believable physics, real-world wardrobe and props, refined practical lighting, no synthetic beauty treatment",
    camera_language:
      "single controlled over-shoulder three-quarter composition, restrained depth of field, subtle slow push-in, stable device geometry",
    environment:
      "quiet refined operator office with glass overlooking a believable active business operation, sophisticated but not corporate boardroom styling",
    subject:
      "credible hands-on international business owner/operator aged approximately 40 to 50, understated smart-casual workwear, composed and experienced",
    action:
      "enter office, sit, phone subtly vibrates, check phone, turn to laptop, second restrained alert redirects attention toward another device",
    composition:
      "camera slightly behind and to the side of operator; laptop and phone visible without dominating; slow push forward; realistic blocking",
    lighting:
      "warm premium practical office light with natural daylight from the operation beyond glass, restrained contrast, realistic skin tones",
    screen_policy:
      "EVERY visible phone, tablet, laptop or monitor must remain deep charcoal to near-black with only subtle low-contrast dark placeholder blocks. Absolutely no white interface, no bright browser page, no readable generated software text, no invented logos, no colorful generic dashboard, no fake Avantiqo UI. Device screens must remain stable and perspective-friendly so authentic Avantiqo UI can be composited later when required.",
    audio_policy:
      "ambient office and distant operational room tone, one subtle phone vibration and soft message tone, one restrained second device alert; no dialogue, no voice-over, no music",
    negative_constraints: [
      "no white device screens",
      "no fake software interfaces",
      "no readable generated UI text",
      "no invented logos",
      "no sci-fi holograms",
      "no glowing interface overlays",
      "no exaggerated stress",
      "no cheesy corporate acting",
      "no staged smiling at camera",
      "no warped hands",
      "no distorted devices",
      "no synthetic skin",
      "no camera shake",
      "no text overlays"
    ],
  },
  screen_replacement: {
    avantiqo_workspace: "none required in opening problem shot; screens remain replaceable if editorially useful",
    replacement_window: "approximately seconds 1.2 to 4.6",
  },
  frame_contract: {
    opening:
      "operator enters or arrives at desk in refined office; active business visible beyond glass; laptop and phone already present with dark screens",
    progression:
      "operator sits; phone gives subtle vibration; he checks it, turns to laptop, then a second restrained alert redirects his attention",
    closing:
      "camera has pushed closer as operator is visibly managing several information sources without any exaggerated frustration",
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
        operation: "AVANTIQO_INVESTOR_FILM_SHOT_01",
        brand: "Avantiqo",
        source: "avantiqo_investor_film_shot_01_20260819_v1",
        provider_priority: ["gemini", "google-veo", "runway"],
        screen_replacement: SHOT.screen_replacement,
      },
      category: "AI",
    });

    const output = result?.output || null;
    const interactionId =
      result?.interaction_id ||
      output?.interaction_id ||
      output?.interactionId ||
      output?.raw?.interaction_id ||
      null;

    return json({
      success: true,
      shot: "01",
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
