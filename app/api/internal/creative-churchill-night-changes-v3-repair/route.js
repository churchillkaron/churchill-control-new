export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
const TOKEN = "churchill-night-changes-v3-repair-20260821";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const REPAIR_VERSION = "CHURCHILL_V3_REPAIR_R1_AUTHENTIC_GEOMETRY";

const A = Object.freeze({
  pool_real: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard_real: "4357898f-23fd-418f-af8d-89e3719c0969",
  pool_electronic_darts_real: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
});

const COMMON = [
  "World-class photoreal hospitality cinema.",
  "The supplied image is geometry truth and must remain recognisably the same Churchill Bar & Restaurant environment.",
  "Do not redesign the venue, furniture, materials, room proportions or lighting architecture.",
  "No generic bar replacement, no cyberpunk redesign, no hologram UI, no fake signage, no fake logo, no cartoon physics.",
  "No generated hero faces or identity substitutions.",
].join(" ");

const SHOTS = Object.freeze({
  shuffleboard_motion: Object.freeze({
    output_key: "pool_to_shuffleboard",
    seconds: 5,
    source: A.shuffleboard_real,
    exact_truth_role: "AUTHENTIC_SHUFFLEBOARD_GEOMETRY_TRUTH",
    prompt: `${COMMON} This is the exact real Churchill shuffleboard source. Preserve the long wooden table, the visible 1 2 3 scoring lines, the three round scoring marks, dark warm room, brick columns, stools and amber/orange practical lighting. Animate only a premium very-low camera glide a few centimetres above the real table while a real shuffleboard puck slides naturally along the surface. Begin with a brief dark circular foreground occlusion that can match-cut from a pool ball. End looking down the authentic scoring end. Do not replace this table with black-and-gold luxury shuffleboard, a different table, bowling equipment, arcade equipment or another venue.`,
  }),
  shuffleboard_to_dart: Object.freeze({
    output_key: "shuffleboard_to_dart",
    seconds: 4,
    source: A.shuffleboard_real,
    exact_truth_role: "AUTHENTIC_SHUFFLEBOARD_GEOMETRY_TRUTH",
    prompt: `${COMMON} Start on this exact real Churchill shuffleboard: same wood, same 1 2 3 scoring lines, same three round marks, same warm amber Churchill room. Track a real puck toward the scoring end. At the table edge the puck passes close to camera and, hidden by that foreground occlusion, becomes a modern dart already in motion. A natural hand catches the dart at the end. No dartboard is visible yet. No cartoon morph, no new room, no generic shuffleboard, no black-and-gold redesign.`,
  }),
  electric_dart_flight: Object.freeze({
    output_key: "electric_dart_flight",
    seconds: 7,
    source: A.pool_electronic_darts_real,
    exact_truth_role: "AUTHENTIC_POOL_ELECTRIC_DARTS_GEOMETRY_TRUTH",
    prompt: `${COMMON} This supplied source is the authentic Churchill games room: orange/amber Churchill pool tables in the foreground and real ELECTRONIC dart machines with illuminated targets, score screens and cabinets on the back wall. Preserve that exact visual language. Create a fast but elegant dart-flight camera move through this same room. The dart travels past the orange Churchill pool table toward the actual electronic dart machine. The final target must visibly remain electronic equipment with cabinet/screen context. ABSOLUTELY FORBIDDEN: traditional dartboard, sisal board, bristle board, cork board, vintage pub dartboard, standalone round board without electronic cabinet and scoring screens. At impact, the electronic target light blooms into a practical circular stage-light fill for the edit into the real Churchill band.`,
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

async function project() {
  assertChurchillNightStoryIntegrity();
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_V3_REPAIR_PROJECT_NOT_PREPARED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_REPAIR_PROJECT_NOT_PREPARED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_REPAIR_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function validateTruthAsset(assetId, truthRole) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,organization_id,creative_project_id,file_url,provider,ai_generated,metadata")
    .eq("id", assetId)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`CHURCHILL_V3_REPAIR_TRUTH_ASSET_MISSING:${assetId}`);
  if (data.ai_generated === true) throw new Error(`CHURCHILL_V3_REPAIR_TRUTH_ASSET_MUST_BE_REAL:${assetId}`);
  if (data.metadata?.truth_role !== truthRole) {
    throw new Error(`CHURCHILL_V3_REPAIR_TRUTH_ROLE_INVALID:${assetId}:${data.metadata?.truth_role || "NONE"}`);
  }
  return data;
}

async function activeGeminiCredentialId() {
  const { data, error } = await supabaseAdmin
    .from("provider_credentials")
    .select("id")
    .eq("provider_id", PROVIDER)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("CHURCHILL_V3_REPAIR_GEMINI_CREDENTIAL_REQUIRED");
  return data.id;
}

function repairRoot(metadata = {}) {
  return metadata.churchill_v3_repairs || {};
}

async function patch(p, generationKey, value, status = "REPAIR_GENERATION_ACTIVE") {
  const metadata = p.metadata || {};
  const current = repairRoot(metadata);
  const next = {
    ...current,
    version: REPAIR_VERSION,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    approved_baseline_locked: {
      wine_universe: true,
      steam_into_bar: true,
    },
    truth_assets: {
      pool_real: A.pool_real,
      shuffleboard_real: A.shuffleboard_real,
      pool_electronic_darts_real: A.pool_electronic_darts_real,
    },
    status,
    generations: {
      ...(current.generations || {}),
      [generationKey]: value,
    },
    story_change_authorized: false,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_v3_repairs: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_REPAIR_SHOT_INVALID");
  const p = await project();
  await validateTruthAsset(shot.source, shot.exact_truth_role);
  const current = repairRoot(p.metadata).generations?.[key] || null;
  if (current?.repair_version === REPAIR_VERSION && current?.status === "COMPLETED" && current?.output_reference) {
    return { success: true, reused: true, key, state: current };
  }
  if (current?.repair_version === REPAIR_VERSION && current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) {
    return { success: true, reused: true, key, state: current };
  }

  const credentialId = await activeGeminiCredentialId();
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: {
      model: MODEL,
      primary_source_asset_id: shot.source,
      source: shot.source,
      selected_assets: [shot.source],
      prompt: shot.prompt,
      provider_prompt: shot.prompt,
      media_duration_seconds: shot.seconds,
      duration_seconds: shot.seconds,
      output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9" },
      generation: {
        model: MODEL,
        output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9" },
      },
      provider_parameters: {
        aspect_ratio: "16:9",
        primary_source_asset_id: shot.source,
      },
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
      credential_id: credentialId,
      quantity: shot.seconds,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_REPAIR_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      repair_version: REPAIR_VERSION,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      generation_key: key,
      output_key: shot.output_key,
      truth_asset_id: shot.source,
      truth_role: shot.exact_truth_role,
      rejected_baseline_preserved: true,
      approved_wine_preserved: true,
      approved_steam_preserved: true,
      provider_fallback_changes_story: false,
      story_change_authorized: false,
      publication_authorized: false,
    },
    category: "AI",
  });

  const state = {
    repair_version: REPAIR_VERSION,
    status: result?.pending ? "PROCESSING" : "COMPLETED",
    provider: result?.provider || PROVIDER,
    model: result?.model || MODEL,
    provider_job_id: result?.provider_job_id || result?.output?.provider_job_id || null,
    provider_status: result?.provider_status || result?.output?.status || null,
    usage_id: result?.usage?.id || null,
    credential_id: result?.credential_id || credentialId,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    duration_seconds: shot.seconds,
    truth_asset_id: shot.source,
    truth_role: shot.exact_truth_role,
    output_key: shot.output_key,
    output_reference: result?.pending
      ? null
      : (result?.output?.file_url || result?.output?.video_url || result?.output?.url || null),
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_REPAIR_SHOT_INVALID");
  const p = await project();
  const current = repairRoot(p.metadata).generations?.[key] || null;
  if (!current) throw new Error("CHURCHILL_V3_REPAIR_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, key, state: current };
  }
  if (current.status === "FAILED") {
    return { success: false, failed: true, pending: false, key, state: current };
  }
  if (current.provider !== PROVIDER || !current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_V3_REPAIR_PENDING_STATE_INCOMPLETE");
  }

  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: PROVIDER,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: {
      model: current.model || MODEL,
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_REPAIR_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      repair_version: REPAIR_VERSION,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      generation_key: key,
      output_key: shot.output_key,
      truth_asset_id: shot.source,
      provider_fallback_changes_story: false,
      story_change_authorized: false,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Gemini repair generation failed",
      completed_at: new Date().toISOString(),
    };
    await patch(p, key, failed, "REPAIR_GENERATION_FAILED");
    return { success: false, failed: true, pending: false, key, state: failed };
  }
  if (result?.pending) {
    const pending = {
      ...current,
      status: "PROCESSING",
      provider_status: result.provider_status || "processing",
      last_polled_at: new Date().toISOString(),
    };
    await patch(p, key, pending);
    return { success: true, pending: true, key, state: pending };
  }

  const outputReference =
    result?.output?.file_url ||
    result?.output?.video_url ||
    result?.output?.url ||
    result?.output?.raw?.output?.storage_reference ||
    result?.output?.raw?.output?.file_url ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_V3_REPAIR_COMPLETED_OUTPUT_REQUIRED");

  const completed = {
    ...current,
    status: "COMPLETED",
    provider_status: result.provider_status || "completed",
    output_reference: outputReference,
    settlement: result.settlement || null,
    pricing: result.pricing || current.pricing || null,
    completed_at: new Date().toISOString(),
    error: null,
  };
  await patch(p, key, completed, "REPAIR_GENERATION_ACTIVE");
  return { success: true, pending: false, key, state: completed };
}

async function status() {
  const p = await project();
  const repairs = repairRoot(p.metadata);
  const generations = repairs.generations || {};
  return {
    success: true,
    creative_project_id: p.id,
    repair_version: REPAIR_VERSION,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    approved_baseline_locked: { wine_universe: true, steam_into_bar: true },
    truth_assets: {
      pool_real: A.pool_real,
      shuffleboard_real: A.shuffleboard_real,
      pool_electronic_darts_real: A.pool_electronic_darts_real,
    },
    generations: Object.fromEntries(Object.keys(SHOTS).map((key) => [key, generations[key] || { status: "NOT_STARTED" }])),
    composite_repairs_required: [
      "ice_time_freeze",
      "pool_to_shuffleboard",
      "electric_dart_flight",
      "frozen_night_hero",
    ],
    master_render_authorized: false,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const shot = text(url.searchParams.get("shot"));
    if (action === "status") return json(await status());
    if (action === "start") {
      if (!shot) return json({ success: false, error: "shot required" }, 400);
      return json(await start(shot));
    }
    if (action === "poll") {
      if (!shot) return json({ success: false, error: "shot required" }, 400);
      return json(await poll(shot));
    }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V3_REPAIR_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
