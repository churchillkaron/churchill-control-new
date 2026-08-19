export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const TOKEN = "avq-founder-film-v1-20260819";
const SOURCE = "avantiqo_founder_film_v1_20260819";
const FOUNDER_ASSET_ID = "052e10e2-432e-4cf9-82bd-65cb5bb7441a";
const CREATIVE_BUCKET = "creative-assets";
const RUNWAY_DATA_URI_LIMIT = 5 * 1024 * 1024;

const NARRATION_SEGMENT =
  "Businesses have software for every department. But most companies still do not have software that understands the whole business.";

const FOUNDER_OPENING = {
  title: "Avantiqo Investor Film — Founder Opening Motion Plate",
  editorial_role: "first founder appearance; opening thesis",
  description:
    "Create a ten-second identity-locked founder performance motion plate from the approved founder keyframe. The founder is speaking the opening investor-film thesis directly to camera. His performance must match the meaning and pacing of this exact line: Businesses have software for every department. But most companies still do not have software that understands the whole business. Begin grounded and nearly still with direct eye contact. Use natural breathing, tiny head movement and restrained facial emphasis. Around the phrase 'every department' allow one small controlled open-hand gesture near torso level. Return to stillness. On 'understands the whole business' give a slight purposeful emphasis with a very small hand or head movement, then settle. Do not invent exaggerated presenter gestures. Keep the mouth clearly visible and unobstructed for later exact audio-conditioned lip sync. Do not attempt exact phoneme timing in this motion plate. Preserve the approved founder identity exactly. Keep the camera stable with only a very subtle cinematic push-in. Premium warm practical lighting, natural skin, realistic body physics, no synthetic smile, no fake UI, no text, no logos.",
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
      "preserve the exact approved founder face, age, skin tone, beard, head shape, body build and overall presence",
    mouth_visibility:
      "mouth and lower face unobstructed for the complete shot; no hand crossing the mouth",
    body_language:
      "restrained founder delivery; direct eye contact; minimal deliberate gesture; no sales-pitch acting",
    camera:
      "stable medium founder frame with an almost imperceptible slow push-in; no reframing jump and no fast movement",
    audio_policy:
      "generate a silent/neutral performance plate only; final Cedar narration and lip sync are applied later",
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
    reference_asset_ids: [FOUNDER_ASSET_ID],
  },
  identity_lock: {
    required: true,
    subject:
      "Patric, founder of Avantiqo, exactly as represented by the approved founder reference asset",
    identity_profile_id: "avantiqo-founder-patric-v1",
    reference_asset_ids: [FOUNDER_ASSET_ID],
    requested_identity_angle: "FRONT_TO_SLIGHT_THREE_QUARTER",
    background_reference_policy: "EXCLUDE",
    verification_required: true,
  },
  assets: [
    {
      id: FOUNDER_ASSET_ID,
      asset_id: FOUNDER_ASSET_ID,
      role: "IDENTITY_REFERENCE",
    },
  ],
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function founderImageDataUri() {
  const supabase = getServiceSupabase();
  const { data: asset, error: assetError } = await supabase
    .from("creative_assets")
    .select("id,storage_path,mime_type")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("id", FOUNDER_ASSET_ID)
    .single();

  if (assetError) throw assetError;
  if (!asset?.storage_path) {
    throw new Error("FOUNDER_REFERENCE_STORAGE_PATH_REQUIRED");
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from(CREATIVE_BUCKET)
    .download(asset.storage_path);

  if (downloadError) throw downloadError;
  if (!blob) throw new Error("FOUNDER_REFERENCE_DOWNLOAD_REQUIRED");

  const buffer = Buffer.from(await blob.arrayBuffer());
  if (!buffer.length) throw new Error("FOUNDER_REFERENCE_IMAGE_EMPTY");

  const mimeType = asset.mime_type || "image/jpeg";
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;

  if (Buffer.byteLength(dataUri, "utf8") > RUNWAY_DATA_URI_LIMIT) {
    throw new Error("FOUNDER_REFERENCE_IMAGE_TOO_LARGE_FOR_RUNWAY");
  }

  return {
    dataUri,
    mimeType,
    bytes: buffer.length,
    encodedBytes: Buffer.byteLength(dataUri, "utf8"),
  };
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
        production_order: [
          "identity-locked motion plate",
          "exact Cedar narration segment",
          "audio-conditioned lip sync",
          "lip-sync validation",
          "editorial cut to voice-over B-roll",
        ],
      });
    }

    if (action === "start-motion") {
      const founderSource = await founderImageDataUri();

      const result = await executeService({
        organization_id: ORGANIZATION_ID,
        bill_to_organization_id: ORGANIZATION_ID,
        entity_id: ENTITY_ID,
        service_id: "ai.video.generate",
        provider_id: "runway",
        input: {
          ...FOUNDER_OPENING,
          identity_source: founderSource.dataUri,
          prompt_image: founderSource.dataUri,
          runway_source_frame_contract: {
            contract: "RUNWAY_APPROVED_IMAGE_SOURCE_DIRECT_V1",
            prepared: true,
            source_media_kind: "image",
            source_asset_id: FOUNDER_ASSET_ID,
            source_mime_type: founderSource.mimeType,
            source_bytes: founderSource.bytes,
            encoded_bytes: founderSource.encodedBytes,
            source_url_persisted: false,
          },
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
          lip_sync_deferred: true,
          source_transport: "DIRECT_APPROVED_IMAGE_DATA_URI",
        },
        category: "AI",
      });

      return json({
        success: true,
        stage: "motion",
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
