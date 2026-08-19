export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import "@/lib/platform/service-runtime/providers/gemini/GeminiFounderStatusRecoveryPatch.js";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-founder-gemini-v1-20260819";
const SOURCE = "avantiqo_founder_gemini_identity_proof_20260819_v1";
const FOUNDER_ASSET_ID = "052e10e2-432e-4cf9-82bd-65cb5bb7441a";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const DURATION_SECONDS = 5;

const SHOT = Object.freeze({
  title: "Avantiqo Founder — Gemini Identity Proof",
  description:
    "Use the supplied source image as authoritative identity evidence and preserve the exact same adult person continuously. Do not reinterpret the face, do not beautify, do not replace with a lookalike, and do not change age, facial geometry, head shape, hairline, beard geometry, eye shape, skin tone, body build, clothing or proportions. Create a premium photoreal founder interview motion plate from this exact source. The person remains almost still, looking toward camera with natural breathing, one natural blink, tiny realistic eye movement and at most a very subtle head micro-adjustment. Keep the mouth relaxed and nearly closed because exact Cedar speech will be lip-synced later. No broad smile, no talking animation, no exaggerated hand gesture, no body turn. Preserve authentic skin texture, pores, wrinkles and facial asymmetry. Avoid waxy skin, plastic smoothing, beauty retouching, artificial teeth, over-sharpening, face morphing or AI-spokesperson aesthetics. Camera is locked with only an almost imperceptible cinematic push-in. Keep the existing premium warm environment and natural depth of field. No generated text, no UI, no logo changes, no holograms, no new objects. The priority is exact identity fidelity and natural photographic realism, not dramatic movement.",
  intent: {
    story_purpose: "prove exact founder identity fidelity before any speaking shot is approved",
    emotional_tone: "calm, intelligent, experienced, grounded, premium",
  },
  requirements: {
    identity_preservation: "absolute continuity with the supplied primary source image",
    realism: "photographic human realism with natural skin texture and restrained motion",
    mouth_policy: "minimal relaxed mouth motion; final Cedar speech is added only after identity approval",
    camera: "locked premium medium founder frame with almost imperceptible push-in",
    negative_constraints: [
      "identity drift",
      "lookalike substitution",
      "face reinterpretation",
      "different hair or hairline",
      "different beard",
      "different jaw or cheek proportions",
      "waxy skin",
      "plastic skin",
      "beauty filter",
      "synthetic spokesperson",
      "exaggerated blinking",
      "talking mouth",
      "teeth distortion",
      "broad smile",
      "large hand movement",
      "camera shake",
      "generated text",
      "fake UI",
      "hologram"
    ],
  },
  output_spec: {
    duration_seconds: DURATION_SECONDS,
    aspect_ratio: "16:9",
  },
  provider_parameters: {
    aspect_ratio: "16:9",
    primary_source_asset_id: FOUNDER_ASSET_ID,
  },
  primary_source_asset_id: FOUNDER_ASSET_ID,
});

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function safeCreativePath(value) {
  const storagePath = String(value || "").trim();
  if (!storagePath.startsWith(`${ORGANIZATION_ID}/`)) return null;
  if (storagePath.includes("..")) return null;
  return storagePath;
}

function interactionIdFrom(result = {}) {
  return (
    result?.interaction_id ||
    result?.interactionId ||
    result?.output?.interaction_id ||
    result?.output?.interactionId ||
    result?.output?.output?.interaction_id ||
    result?.output?.output?.interactionId ||
    null
  );
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);

    const action = url.searchParams.get("action") || "catalog";

    if (action === "catalog") {
      return json({
        success: true,
        provider: PROVIDER,
        model: MODEL,
        duration_seconds: DURATION_SECONDS,
        founder_asset_id: FOUNDER_ASSET_ID,
        identity_policy: "EXPLICIT_PRIMARY_SOURCE_ONLY",
        veo_disabled: true,
        source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
        interaction_recovery_enabled: true,
      });
    }

    if (action === "signed") {
      const storagePath = safeCreativePath(url.searchParams.get("path"));
      if (!storagePath) return json({ success: false, error: "Invalid creative asset path" }, 400);
      const { data, error } = await supabaseAdmin.storage
        .from("creative-assets")
        .createSignedUrl(storagePath, 3600);
      if (error) throw error;
      return json({ success: true, path: storagePath, signed_url: data?.signedUrl || null });
    }

    if (action === "start") {
      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: PROVIDER,
        provider_policy: {
          allowed_providers: [PROVIDER],
          preferred_providers: [PROVIDER],
        },
        input: {
          ...SHOT,
          quantity: DURATION_SECONDS,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_FOUNDER_GEMINI_IDENTITY_PROOF_V1",
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          provider_lock: "GEMINI_ONLY_NO_VEO_FALLBACK",
          identity_reference_mode: "EXPLICIT_PRIMARY_SOURCE_ONLY",
          identity_verification_required_before_use: true,
          source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
          lip_sync_deferred_until_identity_approval: true,
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "gemini-founder-identity-proof",
        provider: result?.provider || PROVIDER,
        model: result?.model || MODEL,
        pending: result?.pending ?? null,
        provider_job_id: result?.provider_job_id || null,
        provider_status: result?.provider_status || null,
        interaction_id: interactionIdFrom(result),
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        started_at: result?.started_at || null,
        pricing: result?.pricing || null,
        output: result?.output || null,
        identity_verified: false,
      });
    }

    if (action === "poll") {
      const providerJobId = url.searchParams.get("provider_job_id");
      const usageId = url.searchParams.get("usage_id");
      const credentialId = url.searchParams.get("credential_id") || null;
      const startedAt = url.searchParams.get("started_at") || null;
      const interactionId = url.searchParams.get("interaction_id") || null;
      if (!providerJobId || !usageId) {
        return json({ success: false, error: "Missing poll parameters" }, 400);
      }

      const result = await settlePendingService({
        organization_id: ORGANIZATION_ID,
        provider: PROVIDER,
        provider_job_id: providerJobId,
        usage_id: usageId,
        credential_id: credentialId,
        started_at: startedAt,
        provider_status_input: {
          model: MODEL,
          interaction_id: interactionId,
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_FOUNDER_GEMINI_IDENTITY_PROOF_V1_POLL",
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: FOUNDER_ASSET_ID,
          provider_lock: "GEMINI_ONLY_NO_VEO_FALLBACK",
          identity_reference_mode: "EXPLICIT_PRIMARY_SOURCE_ONLY",
          identity_verification_required_before_use: true,
          source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
          interaction_id: interactionId,
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "gemini-founder-identity-proof",
        provider: PROVIDER,
        model: MODEL,
        result,
        identity_verified: false,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
