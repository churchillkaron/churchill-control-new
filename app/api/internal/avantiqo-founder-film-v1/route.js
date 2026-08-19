export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-founder-film-v1-20260819";
const SOURCE = "avantiqo_founder_film_identity_reference_v3_20260819";
const FOUNDER_ASSET_ID = "052e10e2-432e-4cf9-82bd-65cb5bb7441a";
const FOUNDER_STORAGE_PATH =
  "33336a72-acb5-474e-856b-8be0269360e2/unassigned/ca19f771-e2ad-4e62-ac50-19ff8efed996-avantiqo-founder-speaking-keyframe.jpg";
const REPAIR_URL = "https://vfsjqabpkcbiuerhzugk.supabase.co/functions/v1/avantiqo-founder-reference-repair?token=avq-founder-repair-20260819";
const MOTION_PROVIDER = "google-veo";
const MOTION_MODEL = "veo-3.1-generate-preview";
const MOTION_DURATION_SECONDS = 8;

const COMMON_NEGATIVES = [
  "no identity drift",
  "no lookalike substitution",
  "no face reinterpretation",
  "no change of ethnicity",
  "no change of age",
  "no change of beard or facial hair geometry",
  "no change of head shape",
  "no change of facial proportions",
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
  "no generated dialogue",
  "no generated narration",
];

const SCENES = Object.freeze({
  opening: {
    title: "Founder Opening Thesis",
    editorial_role: "first founder appearance; opening thesis",
    narration:
      "Businesses have software for every department. But most companies still do not have software that understands the whole business.",
    performance:
      "Begin grounded and almost still with direct eye contact. Use natural breathing and tiny head movement. Around the idea of every department allow one small controlled open-hand gesture near torso level. Return to stillness. On the idea of understanding the whole business give a subtle purposeful emphasis, then settle.",
    transition:
      "End neutral and steady so the edit can cut cleanly into fragmented business systems.",
  },
  platform_definition: {
    title: "Founder Platform Definition",
    editorial_role: "define Avantiqo before the signature authentic-UI screen-rise transition",
    narration:
      "Avantiqo is an AI-native Business Operating System designed to bring the company into one shared operating context.",
    performance:
      "Start with direct eye contact and complete stillness for the Avantiqo beat. On the AI-native Business Operating System idea use one restrained explanatory hand opening close to the torso, then let the hand settle. On one shared operating context slightly reduce the gesture and hold eye contact with calm conviction.",
    transition:
      "At the end allow a brief natural breath and a subtle downward eye-line shift that motivates the cut to a separate device plate. Do not invent a device in this shot.",
  },
  vertical_expansion: {
    title: "Founder Vertical Expansion",
    editorial_role: "connect deep vertical execution to company-wide expansion",
    narration:
      "The point is not one vertical. The point is that Avantiqo can enter through a painful real-world workflow, solve it deeply, and then expand across the company.",
    performance:
      "Use a thoughtful founder delivery. First idea almost motionless. Then make one measured outward hand movement for entering a painful real-world workflow, bring the gesture back inward for solving it deeply, and finish with a small widening gesture for expanding across the company. Keep all movement below the mouth.",
    transition:
      "Hold the final look for a clean cut into cross-industry operations footage.",
  },
  working_product: {
    title: "Founder Working Product",
    editorial_role: "investor proof point; product exists and architecture scales",
    narration:
      "This is already a working product, built from problems experienced while operating real businesses. The platform is multi-company and cross-industry by design.",
    performance:
      "Deliver the first idea with quiet confidence rather than triumph. Use a tiny nod for working product. Keep hands mostly still through operating real businesses. For the second idea use one small open-hand gesture that suggests breadth without becoming promotional. Finish composed and direct.",
    transition:
      "Settle into a stable look that can cut into real Avantiqo product proof, company switching and industry workspaces.",
  },
  future_close: {
    title: "Founder Future Close",
    editorial_role: "final founder statement before Avantiqo end card",
    narration:
      "Avantiqo is building toward a future where the business does not have to explain itself to every new piece of software.",
    performance:
      "Minimal movement. Direct eye contact. Begin reflective and controlled. Let the idea build naturally, with only a slight head emphasis on the business and one very small closing hand movement near the end. No smile at the finish; hold confident calm for the final beat.",
    transition:
      "Hold still after the statement for the cut to the final voice-over and Avantiqo end card.",
  },
});

function sceneContract(sceneKey) {
  const scene = SCENES[sceneKey];
  if (!scene) return null;

  const identityInstruction =
    "The supplied reference image is the approved founder identity and is authoritative. The subject in the generated motion must be that exact same person, not a similar person or a newly interpreted character. Preserve facial geometry, head shape, beard shape, hairline, skin tone, age, body build and proportions continuously. Treat the reference as identity evidence, not merely style inspiration.";

  const motionInstruction =
    "He does not speak in this source generation. Keep lips relaxed and mostly closed with only natural breathing micro-movement. Final Cedar narration and exact lip sync are applied later. Preserve a clear unobstructed mouth and lower face.";

  return {
    title: `Avantiqo Investor Film — ${scene.title}`,
    editorial_role: scene.editorial_role,
    description:
      `${identityInstruction} ${motionInstruction} Create one restrained founder performance whose body language is motivated by this exact intended narration meaning: ${scene.narration} Performance direction: ${scene.performance} Editorial transition: ${scene.transition} The performance must feel like an experienced founder explaining a real operating system to serious investors, never like an actor selling software. Camera remains stable with only an almost imperceptible premium cinematic push-in. Warm practical lighting, natural skin and realistic body physics. No software UI, no text, no logos and no holograms.`,
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
        "absolute continuity with the supplied approved founder reference; same person in every frame",
      mouth_visibility:
        "mouth and lower face unobstructed for the complete shot; lips relaxed because exact Cedar lip sync happens later",
      body_language: scene.performance,
      camera:
        "stable medium founder frame with an almost imperceptible slow push-in; no reframing jump and no fast movement",
      audio_policy:
        "silent identity-preserving motion plate only; do not generate dialogue or narration",
      negative_constraints: COMMON_NEGATIVES,
    },
    shot_bible: {
      precision_control: {
        reference_asset_ids: [FOUNDER_ASSET_ID],
        multi_reference_control_required: true,
      },
      source: {
        reference_asset_ids: [FOUNDER_ASSET_ID],
      },
      output: {
        duration_seconds: MOTION_DURATION_SECONDS,
        aspect_ratio: "16:9",
        resolution: "720p",
      },
    },
    output_spec: {
      duration_seconds: MOTION_DURATION_SECONDS,
      aspect_ratio: "16:9",
      resolution: "720p",
    },
    provider_parameters: {
      reference_asset_ids: [FOUNDER_ASSET_ID],
      aspect_ratio: "16:9",
      resolution: "720p",
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

function safeCreativePath(value) {
  const storagePath = String(value || "").trim();
  if (!storagePath.startsWith(`${ORGANIZATION_ID}/`)) return null;
  if (storagePath.includes("..")) return null;
  return storagePath;
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
        founder_storage_path: FOUNDER_STORAGE_PATH,
        identity_lock: {
          provider: MOTION_PROVIDER,
          model: MOTION_MODEL,
          identity_reference_asset_id: FOUNDER_ASSET_ID,
          reference_mode: "VEO_REFERENCE_IMAGE_ASSET",
          generic_gemini_generation_disabled_for_founder: true,
          duration_seconds: MOTION_DURATION_SECONDS,
          proof_first_policy: "Generate and visually verify opening before any remaining founder shots.",
        },
        screen_rise_policy:
          "The signature screen rise is a separate deterministic VFX transition using authentic Avantiqo UI. Founder generation must never invent the interface.",
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
          "Google Veo opening proof with approved founder identity reference",
          "visual identity verification against approved reference",
          "only after proof passes: remaining founder motion plates using the same reference",
          "complete investor-film edit with continuous Cedar narration",
          "lock master timeline",
          "audio-conditioned lip sync only for verified founder-visible windows",
          "final QC and render",
        ],
      });
    }

    if (action === "repair-reference") {
      const result = await repairFounderReference();
      return json({ success: true, stage: "reference-repair", result });
    }

    if (action === "signed") {
      const storagePath = safeCreativePath(url.searchParams.get("path"));
      if (!storagePath) {
        return json({ success: false, error: "Invalid creative asset path" }, 400);
      }
      const { data, error } = await supabaseAdmin.storage
        .from("creative-assets")
        .createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return json({
        success: true,
        path: storagePath,
        signed_url: data?.signedUrl || null,
        expires_seconds: 3600,
      });
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
        provider_id: MOTION_PROVIDER,
        provider_policy: {
          allowed_providers: [MOTION_PROVIDER],
          preferred_providers: [MOTION_PROVIDER],
        },
        input: {
          ...contract,
          quantity: MOTION_DURATION_SECONDS,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: `AVANTIQO_FOUNDER_${sceneKey.toUpperCase()}_IDENTITY_REFERENCE_V3`,
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          founder_scene: sceneKey,
          narration_segment: scene.narration,
          motion_provider: MOTION_PROVIDER,
          motion_model: MOTION_MODEL,
          identity_reference_asset_id: FOUNDER_ASSET_ID,
          identity_reference_mode: "VEO_REFERENCE_IMAGE_ASSET",
          identity_verification_required_before_use: true,
          lip_sync_deferred_until_identity_and_master_timeline_lock: true,
          reference_repair: repair,
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "identity-reference-motion",
        scene: sceneKey,
        narration_segment: scene.narration,
        identity_lock: {
          provider: MOTION_PROVIDER,
          model: result?.model || MOTION_MODEL,
          identity_reference_asset_id: FOUNDER_ASSET_ID,
          reference_mode: "VEO_REFERENCE_IMAGE_ASSET",
          identity_verified: false,
        },
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
      if (provider !== MOTION_PROVIDER) {
        return json({ success: false, error: "Founder motion must use google-veo" }, 409);
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
          operation: `AVANTIQO_FOUNDER_${sceneKey.toUpperCase()}_IDENTITY_REFERENCE_V3_POLL`,
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          founder_scene: sceneKey,
          narration_segment: scene.narration,
          motion_provider: MOTION_PROVIDER,
          motion_model: MOTION_MODEL,
          identity_reference_asset_id: FOUNDER_ASSET_ID,
          identity_reference_mode: "VEO_REFERENCE_IMAGE_ASSET",
          identity_verification_required_before_use: true,
          lip_sync_deferred_until_identity_and_master_timeline_lock: true,
        },
      });

      return json({
        success: true,
        stage: "identity-reference-motion",
        scene: sceneKey,
        identity_lock: {
          provider: MOTION_PROVIDER,
          model: MOTION_MODEL,
          identity_reference_asset_id: FOUNDER_ASSET_ID,
          reference_mode: "VEO_REFERENCE_IMAGE_ASSET",
          identity_verified: false,
        },
        result,
      });
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
