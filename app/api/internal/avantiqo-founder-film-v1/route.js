export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-founder-film-v1-20260819";
const SOURCE = "avantiqo_founder_film_v1_20260819";
const FOUNDER_ASSET_ID = "052e10e2-432e-4cf9-82bd-65cb5bb7441a";
const REPAIR_URL = "https://vfsjqabpkcbiuerhzugk.supabase.co/functions/v1/avantiqo-founder-reference-repair?token=avq-founder-repair-20260819";

const NARRATION_SEGMENT =
  "Businesses have software for every department. But most companies still do not have software that understands the whole business.";

const FOUNDER_OPENING = {
  title: "Avantiqo Investor Film — Founder Opening Motion Plate",
  editorial_role: "first founder appearance; opening thesis",
  description:
    "Create a ten-second identity-preserving founder performance from the supplied approved founder image. This is Patric, founder of Avantiqo, and his facial geometry, head shape, beard, skin tone, age, body build and overall identity must remain faithful to the supplied source image. He is delivering this exact investor-film thought directly to camera: Businesses have software for every department. But most companies still do not have software that understands the whole business. Begin grounded and almost still with direct eye contact. Use natural breathing, tiny head movement and restrained facial emphasis. Around the phrase 'every department' allow one small controlled open-hand gesture near torso level. Return to stillness. On 'understands the whole business' give a slight purposeful emphasis with a very small hand or head movement, then settle. Keep the mouth and lower face clearly visible for later exact audio-conditioned lip sync. Do not attempt exact phoneme timing in this motion generation. The performance must feel like a real experienced founder speaking to investors, not an actor selling software. Camera remains stable with only a nearly imperceptible premium cinematic push-in. Warm practical lighting, natural skin, realistic body physics. No software UI, no text, no logos and no holograms.",
  intent: {
    story_purpose:
      "Establish the core investor thesis through the founder before the film cuts into fragmented business systems.",
    exact_spoken_meaning: NARRATION_SEGMENT,
    emotional_tone: "experienced, intelligent, calm, authoritative, grounded",
  },
  requirements: {
    visual_quality:
      "world-class photoreal feature-film founder cinematography for a premium global technology investor film",
    identity_preservation:
      "preserve the exact approved founder identity from the supplied source image throughout every frame",
    mouth_visibility:
      "mouth and lower face unobstructed for the complete shot; no hand crossing the mouth",
    body_language:
      "restrained founder delivery; direct eye contact; minimal deliberate gesture; no sales-pitch acting",
    camera:
      "stable medium founder frame with an almost imperceptible slow push-in; no reframing jump and no fast movement",
    audio_policy:
      "motion performance only; final Cedar narration and exact lip sync are applied after generation",
    negative_constraints: [
      "no identity drift",
      "no lookalike substitution",
      "no exaggerated gesturing",
      "no waving",
      "no pointing at camera",
      "no broad smile",
      "no fake software UI",
      "no readable text",
      "no invented logo",
      "no hologram",
      "no camera shake",
      "no mouth obstruction",
      "no dramatic head turns",
    ],
  },
  output_spec: {
    duration_seconds: 10,
    aspect_ratio: "16:9",
  },
  provider_parameters: {
    aspect_ratio: "16:9",
    primary_source_asset_id: FOUNDER_ASSET_ID,
  },
  primary_source_asset_id: FOUNDER_ASSET_ID,
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function repairFounderReference() {
  const response = await fetch(REPAIR_URL, {
    method: "GET",
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success !== true) {
    throw new Error(
      result?.error ||
      result?.message ||
      `FOUNDER_REFERENCE_REPAIR_FAILED:${response.status}`,
    );
  }
  return result;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "catalog";

    if (action === "catalog") {
      return json({
        success: true,
        source: SOURCE,
        founder_asset_id: FOUNDER_ASSET_ID,
        narration_segment: NARRATION_SEGMENT,
        duration_seconds: 10,
        motion_provider: "gemini",
        fallback_provider: "google-veo",
        production_order: [
          "repair approved founder source asset",
          "Gemini image-to-video founder motion",
          "exact Cedar narration segment",
          "audio-conditioned lip sync",
          "lip-sync validation",
          "editorial cut to voice-over B-roll",
        ],
      });
    }

    if (action === "repair-reference") {
      const result = await repairFounderReference();
      return json({ success: true, stage: "reference-repair", result });
    }

    if (action === "start-motion") {
      const repair = await repairFounderReference();

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: "gemini",
        input: {
          ...FOUNDER_OPENING,
          quantity: 10,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_FOUNDER_OPENING_MOTION_V1",
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          narration_segment: NARRATION_SEGMENT,
          motion_provider: "gemini",
          fallback_provider: "google-veo",
          lip_sync_deferred: true,
          reference_repair: repair,
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "motion",
        reference_repair: repair,
        pending: result?.pending ?? null,
        provider: result?.provider || null,
        model: result?.model || null,
        provider_job_id: result?.provider_job_id || null,
        provider_status: result?.provider_status || null,
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        pricing: result?.pricing || null,
        started_at: result?.started_at || null,
        output: result?.output || null,
      });
    }

    if (action === "poll-motion") {
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
          operation: "AVANTIQO_FOUNDER_OPENING_MOTION_V1_POLL",
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          narration_segment: NARRATION_SEGMENT,
          lip_sync_deferred: true,
        },
      });

      return json({ success: true, stage: "motion", result });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
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
