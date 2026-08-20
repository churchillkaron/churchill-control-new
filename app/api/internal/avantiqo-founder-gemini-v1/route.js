export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import "@/lib/platform/service-runtime/providers/gemini/GeminiFounderStatusRecoveryPatch.js";

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  ensureAvantiqoFounderCanonicalReference,
  AvantiqoFounderCanonicalReferenceRuntime,
} from "@/lib/creative/post-production/runtime/AvantiqoFounderCanonicalReferenceRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-founder-gemini-v1-20260819";
const SOURCE = "avantiqo_founder_gemini_identity_proof_20260820_v2";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const DURATION_SECONDS = 5;
const REVIEW_TASK_ID = "avantiqo-founder-canonical-reference-user-approved-20260820";

function shot(reference) {
  return Object.freeze({
    title: "Avantiqo Founder — Canonical Gemini Identity Proof",
    description:
      "The supplied image is the authoritative approved founder identity and exact starting visual. Preserve this exact adult person continuously. Do not reinterpret, beautify, replace, age-shift, de-age, change facial geometry, hairline, beard geometry, eye shape, skin tone, body build, clothing, jewelry or proportions. The face must remain recognizably identical to the supplied reference throughout every frame. Create only restrained natural motion: breathing, one realistic blink, tiny eye movement and at most a very small head micro-adjustment. Keep the mouth relaxed and nearly closed because the exact Cedar founder speech will be lip-synced later. No talking animation, no broad smile, no invented teeth, no large gesture, no body turn. Preserve real skin texture, wrinkles, asymmetry and photographic detail. Camera remains effectively locked with only a subtle cinematic push-in. Keep the existing premium dark business environment and shallow depth of field. Do not add text, interfaces, holograms, logos, props or new people. Identity fidelity is the overriding priority.",
    intent: {
      story_purpose: "prove exact approved founder identity fidelity before speech",
      emotional_tone: "calm, intelligent, experienced, grounded, premium",
    },
    requirements: {
      identity_preservation: "absolute continuity with approved canonical founder frame",
      realism: "photographic human realism, no synthetic spokesperson appearance",
      mouth_policy: "relaxed nearly closed mouth; lip-sync is deferred",
      camera: "locked frame with almost imperceptible push-in",
      negative_constraints: [
        "identity drift",
        "lookalike substitution",
        "face reinterpretation",
        "different hairline",
        "different beard",
        "different jaw",
        "different cheek proportions",
        "different eye shape",
        "waxy skin",
        "plastic skin",
        "beauty filter",
        "synthetic spokesperson",
        "talking mouth",
        "fake teeth",
        "broad smile",
        "large gesture",
        "camera shake",
        "generated text",
        "fake UI",
        "hologram",
      ],
    },
    output_spec: {
      duration_seconds: DURATION_SECONDS,
      aspect_ratio: "16:9",
    },
    image: reference.url,
    source: reference.url,
    primary_source_asset_id: reference.asset_id,
    identity_lock: {
      approved_keyframe_url: reference.url,
    },
    provider_parameters: {
      aspect_ratio: "16:9",
      primary_source_asset_id: reference.asset_id,
      identity_keyframe_approved: true,
      identity_keyframe_url: reference.url,
      identity_keyframe_node_id: reference.asset_id,
      identity_keyframe_review_task_id: REVIEW_TASK_ID,
    },
  });
}

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
    if (url.searchParams.get("token") !== TOKEN) {
      return json({ success: false }, 404);
    }

    const action = url.searchParams.get("action") || "catalog";

    if (action === "catalog") {
      const reference = await ensureAvantiqoFounderCanonicalReference();
      return json({
        success: true,
        provider: PROVIDER,
        model: MODEL,
        duration_seconds: DURATION_SECONDS,
        founder_asset_id: reference.asset_id,
        founder_reference_sha256: reference.checksum_sha256,
        founder_reference_source_type: reference.source_type,
        identity_policy: "VERIFIED_USER_APPROVED_DEPENDENCY_FRAME",
        old_ai_generated_founder_asset_disabled: true,
        veo_disabled: true,
        source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
        interaction_recovery_enabled: true,
      });
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
      });
    }

    if (action === "start") {
      const reference = await ensureAvantiqoFounderCanonicalReference();
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
          ...shot(reference),
          quantity: DURATION_SECONDS,
          currency: "THB",
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_FOUNDER_GEMINI_CANONICAL_IDENTITY_PROOF_V2",
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: reference.asset_id,
          founder_reference_sha256: reference.checksum_sha256,
          provider_lock: "GEMINI_ONLY_NO_VEO_FALLBACK",
          identity_reference_mode: "VERIFIED_USER_APPROVED_DEPENDENCY_FRAME",
          identity_verification_required_before_use: true,
          source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
          lip_sync_deferred_until_identity_approval: true,
          rejected_legacy_founder_asset_id: "052e10e2-432e-4cf9-82bd-65cb5bb7441a",
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "gemini-founder-canonical-identity-proof-v2",
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
        founder_reference: reference,
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
          operation: "AVANTIQO_FOUNDER_GEMINI_CANONICAL_IDENTITY_PROOF_V2_POLL",
          brand: "Avantiqo",
          source: SOURCE,
          founder_asset_id: AvantiqoFounderCanonicalReferenceRuntime.asset_id,
          founder_reference_sha256: AvantiqoFounderCanonicalReferenceRuntime.expected_sha256,
          provider_lock: "GEMINI_ONLY_NO_VEO_FALLBACK",
          identity_reference_mode: "VERIFIED_USER_APPROVED_DEPENDENCY_FRAME",
          identity_verification_required_before_use: true,
          source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
          interaction_id: interactionId,
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "gemini-founder-canonical-identity-proof-v2",
        provider: PROVIDER,
        model: MODEL,
        result,
        identity_verified: false,
      });
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
}
