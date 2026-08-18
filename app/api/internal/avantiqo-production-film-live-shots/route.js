export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";

const COMMON_OUTPUT = {
  duration_seconds: 5,
  aspect_ratio: "16:9",
};

const COMMON_REQUIREMENTS = {
  visual_quality: "world-class photoreal premium enterprise technology commercial",
  realism: "natural human movement, realistic anatomy, believable physics, premium practical lighting",
  camera_language: "controlled motivated cinema camera movement, restrained depth of field, feature-film polish",
  screen_policy: "device screen must remain stable, large and clean enough for later Avantiqo UI replacement; no readable generated text",
  negative_constraints: [
    "no logos",
    "no readable generated UI text",
    "no sci-fi holograms",
    "no glowing interface overlays",
    "no synthetic skin",
    "no warped hands",
    "no cheesy corporate acting",
    "no exaggerated advertising gestures",
    "no generic AI-video beauty look",
  ],
};

const SCENES = {
  field: {
    title: "Avantiqo field service — pest-control technician",
    description: "A premium cinematic commercial shot in Phuket, Thailand, late-morning tropical light. A professional pest-control field technician in clean modern workwear stands outside a high-end tropical villa after completing a service visit. The technician uses a modern smartphone at chest height to review and confirm the completed job, taps once, then looks toward the property with calm operator confidence. The device must remain front-facing enough for later replacement with the real Avantiqo field-service interface.",
    intent: {
      story_purpose: "Show Avantiqo connecting a real field-service worker to the operating system at the exact moment work is completed and verified.",
      emotional_tone: "competent, trustworthy, modern, calm, premium",
      story_state_change: "service visit moves from physical completion to digitally confirmed operational proof",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "high-end tropical Phuket villa exterior with believable pest-control service context",
      subject: "professional pest-control field technician, credible service-company workwear, no visible brand marks",
      action: "review completed job on smartphone, one deliberate tap, then look toward property",
      composition: "over-the-shoulder three-quarter view with phone prominent and stable",
      lighting: "late-morning natural tropical light, refined highlights, realistic skin tones",
    },
    frame_contract: {
      opening: "technician stationary outside villa, smartphone already visible",
      progression: "subtle camera push-in while technician reviews and taps once",
      closing: "technician lowers attention from phone and looks confidently toward property",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: {
      aspect_ratio: "16:9",
    },
  },
  restaurant: {
    title: "Avantiqo hospitality — restaurant waiter order confirmation",
    description: "A premium cinematic commercial shot inside an elegant modern restaurant during active evening service. A professional waiter in a smart dark uniform stands beside a table and uses a compact tablet or modern smartphone to confirm an order. Guests dine naturally in soft focus while another staff member moves through the background. The waiter makes one deliberate tap and immediately continues service. The device screen must remain large and stable enough for later replacement with the real Avantiqo restaurant interface.",
    intent: {
      story_purpose: "Show Avantiqo embedded naturally inside live hospitality service rather than presented as a separate software demo.",
      emotional_tone: "warm, sophisticated, human, fast, controlled",
      story_state_change: "guest order moves from human interaction into governed operational execution",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "upmarket contemporary restaurant during genuine evening service",
      subject: "professional waiter in elegant dark service uniform",
      action: "confirm order on device with one tap, then continue serving naturally",
      composition: "over-the-shoulder three-quarter angle; device screen clearly visible and nearly rectangular to camera",
      lighting: "warm practical restaurant lighting with cinematic contrast and realistic ambient movement",
    },
    frame_contract: {
      opening: "waiter engaged with table, device held steadily within frame",
      progression: "one clean confirmation tap as guests remain naturally active in background",
      closing: "waiter turns smoothly back into service flow",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: {
      aspect_ratio: "16:9",
    },
  },
  manager: {
    title: "Avantiqo operator — multi-business manager command view",
    description: "A premium cinematic enterprise technology shot. A restaurant or multi-business general manager sits in a refined but practical office overlooking an active operation through glass, reviewing performance on a laptop. The camera begins over the manager's shoulder with the laptop screen large, stable and nearly rectangular to camera, then performs a subtle slow push-in. The manager makes one deliberate trackpad action, absorbs the information, then looks through the glass toward the business floor. The laptop display must remain suitable for later replacement with the real Avantiqo dashboard.",
    intent: {
      story_purpose: "Show the operator seeing finance and operations as one connected business context.",
      emotional_tone: "intelligent, composed, authoritative, operator-driven rather than corporate",
      story_state_change: "manager moves from reviewing digital operating intelligence to observing the real business it represents",
    },
    requirements: {
      ...COMMON_REQUIREMENTS,
      environment: "quiet modern operator office overlooking a live hospitality or multi-business operation",
      subject: "credible hands-on general manager, sophisticated but not boardroom-styled",
      action: "review laptop, one deliberate trackpad action, then look through glass toward operation",
      composition: "over-the-shoulder framing with laptop screen large and stable; restrained slow push-in",
      lighting: "warm practical office light mixed with subtle cool monitor illumination",
    },
    frame_contract: {
      opening: "manager seated with laptop clearly visible and operation beyond glass",
      progression: "slow push-in during one deliberate trackpad action",
      closing: "manager looks away from laptop toward the live business floor",
    },
    output_spec: COMMON_OUTPUT,
    provider_parameters: {
      aspect_ratio: "16:9",
    },
  },
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

    const action = url.searchParams.get("action") || "start";
    const scene = url.searchParams.get("scene") || "field";

    if (action === "start") {
      const shot = SCENES[scene];
      if (!shot) return json({ success: false, error: "Unknown scene" }, 400);

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: "gemini",
        input: {
          ...shot,
          quantity: COMMON_OUTPUT.duration_seconds,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: `AVANTIQO_PRODUCTION_FILM_${scene.toUpperCase()}`,
          brand: "Avantiqo",
          source: "avantiqo_production_film_live_shots_20260818",
          provider_priority: ["gemini", "google-veo", "runway"],
        },
        category: "AI",
      });

      return json({
        success: true,
        scene,
        pending: result.pending,
        provider: result.provider,
        model: result.model,
        provider_job_id: result.provider_job_id || null,
        provider_status: result.provider_status || null,
        usage_id: result.usage?.id || null,
        credential_id: result.credential_id || null,
        pricing: result.pricing || null,
        started_at: result.started_at || null,
        output: result.output || null,
      });
    }

    if (action === "poll") {
      const provider = url.searchParams.get("provider");
      const providerJobId = url.searchParams.get("provider_job_id");
      const usageId = url.searchParams.get("usage_id");
      const credentialId = url.searchParams.get("credential_id") || null;
      const startedAt = url.searchParams.get("started_at") || null;
      if (!provider || !providerJobId || !usageId) {
        return json({ success: false, error: "Missing poll parameters" }, 400);
      }

      const result = await settlePendingService({
        organization_id: ORGANIZATION_ID,
        provider,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        started_at: startedAt,
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_PRODUCTION_FILM_LIVE_SHOT_POLL",
          brand: "Avantiqo",
          source: "avantiqo_production_film_live_shots_20260818",
        },
      });

      return json({ success: true, result });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
