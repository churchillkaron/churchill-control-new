export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";
const SHOT_01_INTERACTION_ID = "v1_ChdEeU9GYXYtakdvLTlfdU1QN3JMaW9RcxIXRHlPRmF2LWpHby05X3VNUDdyTGlvUXM";

const SHOT = {
  title: "Avantiqo investor film — Shot 02 continuity replacement — Fragmented Systems",
  description:
    "Continue the exact visual world and operator established in the immediately previous Shot 01 interaction. Preserve the same office architecture, desk, operator identity, apparent age, hair, wardrobe, body proportions, lighting, lens feel, production design and camera axis. Do not relocate or redesign the environment. The operator remains seated at the same desk. He looks from the laptop to the smartphone in his hand, briefly checks a second information source beside the laptop such as an existing secondary device or restrained printed operational note, then returns attention to the laptop while still holding the phone. His movements are efficient and slightly quicker than in Shot 01, communicating that he is manually reconciling disconnected business information. Continue the same restrained camera push naturally rather than resetting to a new angle. The visual message is that the human operator is the integration layer between separate systems. No dialogue, no generated voice-over and no music; preserve natural office ambience and restrained device sounds only.",
  intent: {
    story_purpose:
      "Make fragmented systems visually explicit while preserving exact continuity from Shot 01.",
    emotional_tone:
      "premium, intelligent, operationally credible, calm but increasingly interrupted",
    story_state_change:
      "the operator actively compares separate information sources himself",
  },
  continuity: {
    source: "SHOT_01_STATEFUL_PREVIOUS_INTERACTION",
    immutable:
      "operator identity, office architecture, desk geometry, background operation, lighting, wardrobe, lens feel and camera axis",
    camera:
      "continue the same restrained push and perspective from Shot 01; no reset to a different angle or room",
  },
  requirements: {
    visual_quality:
      "world-class photoreal premium enterprise technology film with feature-film restraint",
    realism:
      "natural human movement, realistic anatomy and physics, exact continuity with Shot 01",
    action:
      "laptop to phone to second information source and back to laptop while still holding phone",
    screen_policy:
      "Every visible phone, tablet, laptop or monitor remains deep charcoal to near-black with subtle low-contrast placeholder blocks only. No white interface, no bright browser page, no readable generated software text, no invented logos, no colorful generic dashboard and no fake Avantiqo UI.",
    audio_policy:
      "preserve natural office ambience and restrained device sounds only; no dialogue, no voice-over, no music",
    negative_constraints: [
      "no environment change",
      "no office redesign",
      "no different actor",
      "no wardrobe change",
      "no camera-axis reset",
      "no fake software interface",
      "no white screens",
      "no readable generated UI text",
      "no invented logos",
      "no floating graphics",
      "no sci-fi holograms",
      "no exaggerated frustration",
      "no warped hands",
      "no distorted devices",
      "no synthetic skin",
      "no text overlays"
    ],
  },
  editorial: {
    voiceover_reference:
      "Sales in one place. Operations in another. Finance somewhere else.",
    visual_message:
      "the owner is manually connecting the company",
  },
  output_spec: {
    duration_seconds: 5,
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
        provider_parameters: {
          aspect_ratio: "16:9",
          previous_interaction_id: SHOT_01_INTERACTION_ID,
        },
      },
      metadata: {
        module: "CREATIVE",
        operation: "AVANTIQO_INVESTOR_FILM_SHOT_02_CONTINUITY",
        brand: "Avantiqo",
        source: "avantiqo_investor_film_shot_02_stateful_continuity_20260819_v2",
        continuity_source_interaction_id: SHOT_01_INTERACTION_ID,
      },
      category: "AI",
    });

    const output = result?.output || null;
    const providerOutput = output?.output || {};

    return json({
      success: true,
      shot: "02-continuity",
      title: SHOT.title,
      continuity_mode: "STATEFUL_PREVIOUS_INTERACTION",
      pending: result?.pending ?? null,
      provider: result?.provider || null,
      model: result?.model || null,
      provider_job_id: result?.provider_job_id || null,
      provider_status: result?.provider_status || null,
      interaction_id:
        result?.interaction_id ||
        output?.interaction_id ||
        providerOutput?.interaction_id ||
        null,
      usage_id: result?.usage?.id || null,
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
