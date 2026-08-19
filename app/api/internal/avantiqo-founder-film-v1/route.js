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

const COMMON_NEGATIVES = [
  "no identity drift",
  "no lookalike substitution",
  "no exaggerated gesturing",
  "no waving",
  "no pointing at camera",
  "no broad sales-pitch smile",
  "no fake software UI",
  "no readable generated text",
  "no invented logo",
  "no hologram",
  "no camera shake",
  "no mouth obstruction",
  "no dramatic head turns",
];

const SCENES = Object.freeze({
  opening: {
    title: "Founder Opening Thesis",
    editorial_role: "first founder appearance; opening thesis",
    narration:
      "Businesses have software for every department. But most companies still do not have software that understands the whole business.",
    performance:
      "Begin grounded and almost still with direct eye contact. Use natural breathing and tiny head movement. Around 'every department' allow one small controlled open-hand gesture near torso level. Return to stillness. On 'understands the whole business' give a subtle purposeful emphasis, then settle.",
    transition:
      "End neutral and steady so the edit can cut cleanly into fragmented business systems.",
  },
  platform_definition: {
    title: "Founder Platform Definition",
    editorial_role: "define Avantiqo before the signature authentic-UI screen-rise transition",
    narration:
      "Avantiqo is an AI-native Business Operating System designed to bring the company into one shared operating context.",
    performance:
      "Start with direct eye contact and complete stillness for the word Avantiqo. On 'AI-native Business Operating System' use one restrained explanatory hand opening close to the torso, then let the hand settle. On 'one shared operating context' slightly reduce the gesture and hold eye contact with calm conviction.",
    transition:
      "After the final word, allow a brief natural breath and a subtle downward eye-line shift that motivates the cut to a separate device plate. Do not invent a device in this shot. The next edit is the authentic Avantiqo screen rising from the real device using the approved real product recording, never generated UI.",
  },
  vertical_expansion: {
    title: "Founder Vertical Expansion",
    editorial_role: "connect deep vertical execution to company-wide expansion",
    narration:
      "The point is not one vertical. The point is that Avantiqo can enter through a painful real-world workflow, solve it deeply, and then expand across the company.",
    performance:
      "Use a thoughtful founder delivery. First sentence almost motionless. On the second sentence make one measured outward hand movement on 'enter through a painful real-world workflow', then bring the gesture back inward on 'solve it deeply'. Finish with a small widening gesture on 'expand across the company'. Keep all movement below the mouth.",
    transition:
      "Hold the final look for a clean cut into cross-industry operations footage.",
  },
  working_product: {
    title: "Founder Working Product",
    editorial_role: "investor proof point; product exists and architecture scales",
    narration:
      "This is already a working product, built from problems experienced while operating real businesses. The platform is multi-company and cross-industry by design.",
    performance:
      "Deliver the first sentence with quiet confidence rather than triumph. Use a tiny nod on 'working product'. Keep hands mostly still through 'operating real businesses'. For the second sentence use one small open-hand gesture that suggests breadth without becoming promotional. Finish composed and direct.",
    transition:
      "Settle into a stable look that can cut into real Avantiqo product proof, company switching and industry workspaces.",
  },
  future_close: {
    title: "Founder Future Close",
    editorial_role: "final founder statement before Avantiqo end card",
    narration:
      "Avantiqo is building toward a future where the business does not have to explain itself to every new piece of software.",
    performance:
      "Minimal movement. Direct eye contact. Begin reflective and controlled. Let the sentence build naturally, with only a slight head emphasis on 'the business' and one very small closing hand movement on 'every new piece of software'. No smile at the finish; hold confident calm for the final beat.",
    transition:
      "Hold still after the sentence for the cut to the final voice-over lines: The system already understands the company. Avantiqo. One operating system for the intelligent enterprise.",
  },
});

function sceneContract(sceneKey) {
  const scene = SCENES[sceneKey];
  if (!scene) return null;

  return {
    title: `Avantiqo Investor Film — ${scene.title}`,
    editorial_role: scene.editorial_role,
    description:
      `Create a ten-second identity-preserving founder performance from the supplied approved founder image. This is Patric, founder of Avantiqo. Preserve facial geometry, head shape, beard, skin tone, age, body build and overall identity faithfully throughout every frame. He is delivering this exact investor-film narration directly to camera: ${scene.narration} Performance direction: ${scene.performance} Editorial transition: ${scene.transition} Keep the mouth and lower face clearly visible for later exact audio-conditioned lip sync. Do not attempt exact phoneme timing in this motion generation. The performance must feel like an experienced founder explaining a real operating system to serious investors, never like an actor selling software. Camera remains stable with only an almost imperceptible premium cinematic push-in. Warm practical lighting, natural skin and realistic body physics. No software UI, no text, no logos and no holograms.`,
    intent: {
      story_purpose: scene.editorial_role,
      exact_spoken_meaning: scene.narration,
      emotional_tone: "experienced, intelligent, calm, authoritative, grounded",
      editorial_transition: scene.transition,
    },
    requirements: {
      visual_quality:
        "world-class photoreal feature-film founder cinematography for a premium global technology investor film",
      identity_preservation:
        "preserve the exact approved founder identity from the supplied source image throughout every frame",
      mouth_visibility:
        "mouth and lower face unobstructed for the complete shot; no hand crossing the mouth",
      body_language: scene.performance,
      camera:
        "stable medium founder frame with an almost imperceptible slow push-in; no reframing jump and no fast movement",
      audio_policy:
        "motion performance only; final Cedar narration and exact lip sync are applied after the complete film edit is locked",
      negative_constraints: COMMON_NEGATIVES,
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
}

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
    const sceneKey = url.searchParams.get("scene") || "opening";
    const scene = SCENES[sceneKey];

    if (action === "catalog") {
      return json({
        success: true,
        source: SOURCE,
        founder_asset_id: FOUNDER_ASSET_ID,
        duration_seconds: 10,
        motion_provider: "gemini",
        fallback_provider: "google-veo",
        screen_rise_policy:
          "The signature screen rise is a separate deterministic VFX transition using authentic Avantiqo UI from the approved real product recording. Founder generation must never invent the interface.",
        scenes: Object.fromEntries(
          Object.entries(SCENES).map(([key, item]) => [
            key,
            {
              title: item.title,
              editorial_role: item.editorial_role,
              narration: item.narration,
              performance: item.performance,
              transition: item.transition,
            },
          ]),
        ),
        production_order: [
          "Gemini founder motion performances",
          "complete investor-film edit with continuous Cedar narration",
          "authentic Avantiqo screen-rise VFX from real product recording",
          "lock master timeline",
          "audio-conditioned lip sync only for founder-visible windows",
          "lip-sync validation",
          "final master render",
        ],
      });
    }

    if (action === "repair-reference") {
      const result = await repairFounderReference();
      return json({ success: true, stage: "reference-repair", result });
    }

    if (!scene) {
      return json({ success: false, error: "Unsupported founder scene" }, 400);
    }

    if (action === "start-motion") {
      const repair = await repairFounderReference();
      const contract = sceneContract(sceneKey);

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: "gemini",
        input: {
          ...contract,
          quantity: 10,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: `AVANTIQO_FOUNDER_${sceneKey.toUpperCase()}_MOTION_V1`,
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          founder_scene: sceneKey,
          narration_segment: scene.narration,
          motion_provider: "gemini",
          fallback_provider: "google-veo",
          lip_sync_deferred_until_master_timeline_lock: true,
          reference_repair: repair,
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "motion",
        scene: sceneKey,
        narration_segment: scene.narration,
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
          operation: `AVANTIQO_FOUNDER_${sceneKey.toUpperCase()}_MOTION_V1_POLL`,
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          founder_scene: sceneKey,
          narration_segment: scene.narration,
          lip_sync_deferred_until_master_timeline_lock: true,
        },
      });

      return json({ success: true, stage: "motion", scene: sceneKey, result });
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
