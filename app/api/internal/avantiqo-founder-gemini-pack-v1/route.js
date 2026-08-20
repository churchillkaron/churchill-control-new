export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";

const supabase = getServiceSupabase();

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const BUCKET = "creative-assets";
const TOKEN = "avq-founder-gemini-pack-v1-20260820";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const DURATION_SECONDS = 10;

const SLOTS = Object.freeze({
  warm_office: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/warm-office.png`,
    sha256: "aa638d4025af404c9db1001d85dae6a0280624c10b47dd80fd3069589a4fbe9c",
    name: "Founder Original — Warm Office",
    description:
      "Original founder frame in a premium warm office. Preserve the exact adult person, clothing, jewelry, facial geometry, skin texture and environment. Create one continuous natural ten-second performance with restrained hand movement, breathing, blinking and subtle head movement. No loops, no repeated gesture cycle, no speaking animation, no generated text or interface.",
    purpose: "founder origin and conviction",
  },
  night_office: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/night-office.png`,
    sha256: "38ed6574d8433a19b147ce5f667c8e5eda3319f19acb7bc158a5796add8658c5",
    name: "Founder Original — Avantiqo Night Office",
    description:
      "Original founder frame in a premium Avantiqo night office. Preserve the exact adult person and all real visual details. Create one uninterrupted ten-second performance with calm breathing, one or two blinks, a subtle weight shift and a restrained hand gesture that evolves once and does not repeat. Keep the mouth relaxed for later lip-sync. No loops, no fake text changes, no new props.",
    purpose: "brand authority and strategic expansion",
  },
  restaurant: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/restaurant.png`,
    sha256: "2650f1b295cf6235561f5b4917b280184b96de25cebe802ce3edf0b369678ca7",
    name: "Founder Original — Restaurant",
    description:
      "Original founder frame inside a real premium restaurant environment. Preserve the exact adult person, identity, clothing, jewelry and background. Create one continuous ten-second natural performance with subtle torso movement, a single evolving hand gesture, breathing, blinking and a small glance before returning to camera. Mouth stays neutral for later lip-sync. Never loop or recycle motion.",
    purpose: "real business founder story",
  },
  portrait: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/portrait.png`,
    sha256: "3f8d93868aaa2e98ff63ce3f07f10ee3f6c330785fbd68239fff5aeee5e84520",
    name: "Founder Original — Portrait",
    description:
      "Original founder portrait with folded arms in a premium business environment. Preserve the exact adult person and photographic realism. Create a continuous ten-second contemplative performance with breathing, realistic blinking, tiny eye movement and one subtle posture adjustment. Keep arms naturally composed and mouth relaxed. No talking animation, no loop, no repeated micro-cycle.",
    purpose: "quiet confidence and governed AI thesis",
  },
  seated_hologram: {
    path: `${ORGANIZATION_ID}/${PROJECT_ID}/founder-originals-v1/seated-hologram.png`,
    sha256: "36aa2d3ec28aca27612f5471f04edca5068cade50f7feadeef1cea53afb1ef42",
    name: "Founder Original — Seated Hologram",
    description:
      "Original founder seated beside the approved Avantiqo holographic interface. Preserve the exact adult person, laptop, table, environment and the existing hologram design exactly as present in the source frame. Create one continuous ten-second performance with a restrained natural hand interaction toward the laptop or hologram, realistic breathing, blinking and slight head movement. Do not redesign, enlarge, full-screen, replace or regenerate the hologram. No loop and no repeated gesture.",
    purpose: "spatial intelligence hero moment",
  },
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function slotFrom(value) {
  const key = text(value);
  if (!SLOTS[key]) throw new Error(`FOUNDER_GEMINI_SLOT_INVALID:${key}`);
  return { key, ...SLOTS[key] };
}

function storageReference(path) {
  return `storage://${BUCKET}/${path}`;
}

async function sourceNode(slot) {
  const url = storageReference(slot.path);
  const { data, error } = await supabase
    .from("creative_asset_nodes")
    .select("id, organization_id, creative_project_id, type, status, name, url, technical, metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_project_id", PROJECT_ID)
    .eq("url", url)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function registerSource(slot) {
  const existing = await sourceNode(slot);
  if (existing) return existing;

  const { data: file, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(slot.path);
  if (downloadError) throw downloadError;
  if (!file) throw new Error(`FOUNDER_SOURCE_NOT_UPLOADED:${slot.key}`);

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
  if (checksum !== slot.sha256) {
    throw new Error(`FOUNDER_SOURCE_CHECKSUM_MISMATCH:${slot.key}:${checksum}`);
  }

  const payload = {
    organization_id: ORGANIZATION_ID,
    creative_project_id: PROJECT_ID,
    type: "IMAGE",
    status: "IMPORTED",
    title: slot.name,
    name: slot.name,
    description: slot.description,
    uri: storageReference(slot.path),
    url: storageReference(slot.path),
    storage_path: slot.path,
    technical: {
      mime_type: "image/png",
      width: 1672,
      height: 941,
      checksum_sha256: checksum,
      size_bytes: bytes.length,
    },
    metadata: {
      founder_original_source: true,
      founder_source_slot: slot.key,
      source_policy: "USER_SUPPLIED_ORIGINAL",
      identity_reference: true,
      creative_project_id: PROJECT_ID,
    },
    lineage: {
      source: "USER_SUPPLIED_ORIGINAL",
      parent_asset_ids: [],
    },
    review: {
      human_supplied: true,
      identity_reference: true,
    },
    reuse: {
      allowed: true,
      founder_identity_only: true,
    },
  };

  const { data, error } = await supabase
    .from("creative_asset_nodes")
    .insert(payload)
    .select("id, organization_id, creative_project_id, type, status, name, url, technical, metadata")
    .single();
  if (error) throw error;
  return data;
}

function founderShot(slot, assetId) {
  return {
    title: `${slot.name} — Gemini 10s Motion Take`,
    description: slot.description,
    intent: {
      story_purpose: slot.purpose,
      emotional_tone: "calm, intelligent, grounded, cinematic, premium",
    },
    requirements: {
      identity_preservation: "absolute continuity with the supplied original founder frame",
      duration_policy: "one continuous ten-second performance",
      loop_policy: "forbidden",
      mouth_policy: "relaxed natural mouth; final Cedar speech will be lip-synced later",
      motion_policy: "one evolving non-repeating performance, no cyclic gesture reuse",
      negative_constraints: [
        "identity drift",
        "lookalike substitution",
        "face reinterpretation",
        "beauty filter",
        "waxy skin",
        "synthetic spokesperson",
        "repeated gesture",
        "looped motion",
        "jump cut",
        "talking mouth",
        "fake teeth",
        "generated captions",
        "generated UI",
        "new logo",
      ],
    },
    output_spec: {
      duration_seconds: DURATION_SECONDS,
      aspect_ratio: "16:9",
    },
    primary_source_asset_id: assetId,
    provider_parameters: {
      aspect_ratio: "16:9",
      primary_source_asset_id: assetId,
      identity_keyframe_approved: true,
    },
    quantity: DURATION_SECONDS,
    currency: "THB",
  };
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

    const action = text(url.searchParams.get("action")) || "catalog";

    if (action === "catalog") {
      return json({
        success: true,
        provider: PROVIDER,
        model: MODEL,
        duration_seconds_per_take: DURATION_SECONDS,
        looping_allowed: false,
        veo_allowed: false,
        slots: Object.entries(SLOTS).map(([key, value]) => ({
          key,
          name: value.name,
          path: value.path,
          sha256: value.sha256,
          purpose: value.purpose,
        })),
      });
    }

    if (action === "tickets") {
      const tickets = [];
      for (const [key, value] of Object.entries(SLOTS)) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUploadUrl(value.path, { upsert: true });
        if (error) throw error;
        tickets.push({
          key,
          path: value.path,
          signed_url: data?.signedUrl || null,
          upload_token: data?.token || null,
          sha256: value.sha256,
        });
      }
      return json({ success: true, bucket: BUCKET, tickets });
    }

    if (action === "register") {
      const slot = slotFrom(url.searchParams.get("slot"));
      const node = await registerSource(slot);
      return json({ success: true, slot: slot.key, source_node: node });
    }

    if (action === "register-all") {
      const sources = [];
      for (const key of Object.keys(SLOTS)) {
        const slot = slotFrom(key);
        sources.push({ slot: key, source_node: await registerSource(slot) });
      }
      return json({ success: true, sources });
    }

    if (action === "start") {
      const slot = slotFrom(url.searchParams.get("slot"));
      const node = await registerSource(slot);
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
          ...founderShot(slot, node.id),
          model: MODEL,
        },
        metadata: {
          module: "CREATIVE",
          operation: "AVANTIQO_FOUNDER_GEMINI_10S_SOURCE_PACK_V1",
          brand: "Avantiqo",
          creative_project_id: PROJECT_ID,
          founder_source_slot: slot.key,
          founder_source_asset_id: node.id,
          provider_lock: "GEMINI_ONLY",
          model_lock: MODEL,
          duration_seconds: DURATION_SECONDS,
          loop_policy: "FORBIDDEN",
          source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
          lipsync_deferred: true,
        },
        category: "AI",
      });

      return json({
        success: true,
        slot: slot.key,
        provider: result?.provider || PROVIDER,
        model: result?.model || MODEL,
        source_asset_id: node.id,
        pending: result?.pending ?? null,
        provider_job_id: result?.provider_job_id || null,
        provider_status: result?.provider_status || null,
        interaction_id: interactionIdFrom(result),
        usage_id: result?.usage?.id || null,
        credential_id: result?.credential_id || null,
        started_at: result?.started_at || null,
        output: result?.output || null,
      });
    }

    if (action === "poll") {
      const slot = slotFrom(url.searchParams.get("slot"));
      const providerJobId = text(url.searchParams.get("provider_job_id"));
      const usageId = text(url.searchParams.get("usage_id"));
      const credentialId = text(url.searchParams.get("credential_id")) || null;
      const startedAt = text(url.searchParams.get("started_at")) || null;
      const interactionId = text(url.searchParams.get("interaction_id")) || null;

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
          operation: "AVANTIQO_FOUNDER_GEMINI_10S_SOURCE_PACK_V1_POLL",
          creative_project_id: PROJECT_ID,
          founder_source_slot: slot.key,
          provider_lock: "GEMINI_ONLY",
          model_lock: MODEL,
          duration_seconds: DURATION_SECONDS,
          loop_policy: "FORBIDDEN",
          source_audio_policy: "DISCARD_PROVIDER_AUDIO_USE_LOCKED_CEDAR_MASTER",
        },
        category: "AI",
      });

      return json({
        success: true,
        slot: slot.key,
        provider: PROVIDER,
        model: MODEL,
        result,
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
