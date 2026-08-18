export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-livefilm-20260818-b9c17e4a";

const SCENES = {
  field: `Premium cinematic commercial shot, Phuket Thailand, late morning natural light. A professional pest-control field technician in clean modern workwear stands outside a high-end tropical villa after completing a service visit. Over-the-shoulder three-quarter camera angle. The technician uses a modern smartphone held steady at chest height, reviewing and confirming a completed job in a sophisticated dark-blue business operations app. Keep the phone screen large, front-facing enough for later screen replacement, with minimal hand movement and no readable generated text. The technician taps once, then looks toward the property with calm confidence. Realistic documentary-commercial cinematography, shallow depth of field, restrained camera push-in, premium enterprise technology campaign, natural human movement, no logos, no fake readable UI, no exaggerated sci-fi effects.`,
  restaurant: `Premium cinematic commercial shot inside an elegant modern restaurant during active evening service. A professional waiter in smart dark uniform stands near a table and uses a modern smartphone or compact tablet to confirm an order. Over-the-shoulder three-quarter angle with the device screen clearly visible and stable for later screen replacement. Screen should be a simple dark-blue interface glow with no readable generated text. In the soft-focus background, guests dine and another staff member moves naturally. The waiter taps once and immediately continues service. Sophisticated global hospitality technology commercial, warm practical lighting, controlled camera movement, premium realistic color, natural motion, no logos, no fake readable UI, no cheesy advertising gestures.`,
  manager: `Premium cinematic enterprise technology commercial. A restaurant or multi-business general manager sits in a quiet office overlooking an active operation, reviewing performance on a laptop. Camera begins over the manager's shoulder with the laptop screen large and nearly rectangular to camera, stable for later screen replacement, then makes a subtle slow push-in. The manager compares operational and financial information, makes one deliberate trackpad action, then looks through the glass toward the business floor. Dark refined workspace, practical warm lighting mixed with cool monitor light, highly realistic, executive but operator-driven, no suits-and-handshakes cliche, no logos, no fake readable UI, no sci-fi holograms.`,
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
      const prompt = SCENES[scene];
      if (!prompt) return json({ success: false, error: "Unknown scene" }, 400);

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: "gemini",
        input: {
          prompt,
          duration_seconds: 5,
          aspect_ratio: "16:9",
          quantity: 5,
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
