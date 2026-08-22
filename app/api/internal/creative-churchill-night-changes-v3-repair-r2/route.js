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
const TOKEN = "churchill-night-changes-v3-repair-r2-20260821";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const REPAIR_VERSION = "CHURCHILL_V3_REPAIR_R2_EDITORIAL_ELEGANCE";

const A = Object.freeze({
  shuffleboard_real: "4357898f-23fd-418f-af8d-89e3719c0969",
  pool_electronic_darts_real: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
});

const COMMON = [
  "Premium photoreal hospitality cinema, restrained and elegant.",
  "The supplied Churchill reference is geometry truth and must remain recognisably the exact same venue.",
  "Preserve walls, furniture, table geometry, materials, practical lighting, proportions and spatial relationships.",
  "Do not redesign the room. Do not beautify it into a different luxury venue.",
  "No cyberpunk, no holograms, no fantasy light trails, no fake signage, no fake logo, no cartoon transformation, no glossy AI showroom look.",
  "No generated hero faces. Keep motion physically plausible, short and controlled.",
  "Camera language: high-end commercial, deliberate, minimal, confident; no frantic orbiting, no impossible room reconstruction.",
].join(" ");

const SHOTS = Object.freeze({
  shuffleboard_exit_r2: Object.freeze({
    output_key: "shuffleboard_to_dart_r2_a",
    seconds: 3,
    source: A.shuffleboard_real,
    exact_truth_role: "AUTHENTIC_SHUFFLEBOARD_GEOMETRY_TRUTH",
    prompt: `${COMMON} Use this exact real Churchill shuffleboard. Preserve the warm wooden table, visible 1 2 3 scoring lines, three round scoring marks, brick columns, stools and amber practical room exactly. A real shuffleboard puck glides naturally toward the scoring end. Camera is extremely low and almost locked, with only a subtle premium push of a few centimetres. In the final half-second the puck passes very close across lens and fills the frame with a dark circular foreground wipe. STOP THERE. Do not transform the puck into anything. No hand, no dart, no new room, no black-and-gold redesign. The elegance comes from real wood texture, shallow depth, restrained movement and the clean occlusion cut.`,
  }),
  dart_entry_r2: Object.freeze({
    output_key: "electric_dart_flight_r2_a",
    seconds: 2,
    source: A.pool_electronic_darts_real,
    exact_truth_role: "AUTHENTIC_POOL_ELECTRIC_DARTS_GEOMETRY_TRUTH",
    prompt: `${COMMON} This is the exact real Churchill games room. Preserve the orange/amber Churchill pool tables and the real ELECTRONIC dart machines with illuminated targets, cabinets and scoring screens on the back wall. Begin with a brief dark foreground occlusion matching the previous puck wipe. As the occlusion clears, one modern dart crosses close to camera in a clean physically plausible line. Camera remains nearly fixed. Do not fly the camera through the room. Do not add people. Do not change any dart machine into a traditional board. No trails, sparks or sci-fi effects.`,
  }),
  dart_midflight_r2: Object.freeze({
    output_key: "electric_dart_flight_r2_b",
    seconds: 2,
    source: A.pool_electronic_darts_real,
    exact_truth_role: "AUTHENTIC_POOL_ELECTRIC_DARTS_GEOMETRY_TRUTH",
    prompt: `${COMMON} Keep this exact Churchill games room unchanged. The orange/amber pool table remains foreground context and the electronic dart cabinets/screens remain visibly electronic on the back wall. Use a compressed long-lens commercial perspective with a subtle forward camera drift only. A single modern dart travels through the middle depth of the real room toward the electronic target. The dart is sharp for a brief moment while the background stays recognisable. No impossible POV, no room warping, no traditional dartboard, no neon trail, no exaggerated speed-ramp look.`,
  }),
  dart_impact_r2: Object.freeze({
    output_key: "electric_dart_flight_r2_c",
    seconds: 3,
    source: A.pool_electronic_darts_real,
    exact_truth_role: "AUTHENTIC_POOL_ELECTRIC_DARTS_GEOMETRY_TRUTH",
    prompt: `${COMMON} Preserve the exact Churchill electronic dart machines, their cabinets, illuminated target rings and scoring screens. Compose a refined telephoto push toward the authentic electronic target. One modern dart arrives and impacts the real electronic target. The machine remains clearly electronic before, during and after impact. At impact allow only a brief practical exposure bloom from the existing circular target illumination, suitable for a match cut into the real stage spotlight. No explosion, no particles, no fantasy energy, no standalone traditional dartboard, no room redesign.`,
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
  if (!mission?.id) throw new Error("CHURCHILL_V3_REPAIR_R2_MISSION_REQUIRED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_REPAIR_R2_PROJECT_REQUIRED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_REPAIR_R2_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function validateTruthAsset(assetId, truthRole) {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,organization_id,file_url,ai_generated,metadata")
    .eq("id", assetId)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`CHURCHILL_V3_REPAIR_R2_TRUTH_ASSET_MISSING:${assetId}`);
  if (data.ai_generated === true) throw new Error(`CHURCHILL_V3_REPAIR_R2_TRUTH_ASSET_MUST_BE_REAL:${assetId}`);
  if (data.metadata?.truth_role !== truthRole) {
    throw new Error(`CHURCHILL_V3_REPAIR_R2_TRUTH_ROLE_INVALID:${assetId}:${data.metadata?.truth_role || "NONE"}`);
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
  if (!data?.id) throw new Error("CHURCHILL_V3_REPAIR_R2_GEMINI_CREDENTIAL_REQUIRED");
  return data.id;
}

function r2Root(metadata = {}) {
  return metadata.churchill_v3_repairs_r2 || {};
}

async function patch(p, generationKey, value, status = "R2_REPAIR_ACTIVE") {
  const metadata = p.metadata || {};
  const current = r2Root(metadata);
  const next = {
    ...current,
    version: REPAIR_VERSION,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    strategy: "EDITORIAL_MATCH_CUTS_OVER_GENERATIVE_TRANSFORMATION",
    rejected_r1_keys: ["shuffleboard_to_dart", "electric_dart_flight"],
    approved_r1_key: "shuffleboard_motion",
    story_change_authorized: false,
    publication_authorized: false,
    status,
    generations: {
      ...(current.generations || {}),
      [generationKey]: value,
    },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_v3_repairs_r2: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_REPAIR_R2_SHOT_INVALID");
  const p = await project();
  await validateTruthAsset(shot.source, shot.exact_truth_role);
  const current = r2Root(p.metadata).generations?.[key] || null;
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
      operation: `CHURCHILL_V3_REPAIR_R2_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      repair_version: REPAIR_VERSION,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      generation_key: key,
      output_key: shot.output_key,
      truth_asset_id: shot.source,
      truth_role: shot.exact_truth_role,
      r1_rejected: true,
      story_change_authorized: false,
      provider_fallback_changes_story: false,
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
  if (!shot) throw new Error("CHURCHILL_V3_REPAIR_R2_SHOT_INVALID");
  const p = await project();
  const current = r2Root(p.metadata).generations?.[key] || null;
  if (!current) throw new Error("CHURCHILL_V3_REPAIR_R2_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, key, state: current };
  }
  if (current.status === "FAILED") {
    return { success: false, failed: true, pending: false, key, state: current };
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
      operation: `CHURCHILL_V3_REPAIR_R2_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      repair_version: REPAIR_VERSION,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      generation_key: key,
      output_key: shot.output_key,
      truth_asset_id: shot.source,
      story_change_authorized: false,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Gemini R2 repair failed",
      completed_at: new Date().toISOString(),
    };
    await patch(p, key, failed, "R2_REPAIR_FAILED");
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
  if (!outputReference) throw new Error("CHURCHILL_V3_REPAIR_R2_COMPLETED_OUTPUT_REQUIRED");

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
  await patch(p, key, completed, "R2_REPAIR_REVIEW_REQUIRED");
  return { success: true, pending: false, key, state: completed };
}

async function status() {
  const p = await project();
  const root = r2Root(p.metadata);
  return {
    success: true,
    repair_version: REPAIR_VERSION,
    strategy: root.strategy || "EDITORIAL_MATCH_CUTS_OVER_GENERATIVE_TRANSFORMATION",
    story_change_authorized: false,
    publication_authorized: false,
    generations: root.generations || {},
    available_shots: Object.keys(SHOTS),
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status");
    const shot = text(url.searchParams.get("shot"));
    if (action === "status") return json(await status());
    if (action === "start") return json(await start(shot));
    if (action === "poll") return json(await poll(shot));
    return json({ success: false, error: "Invalid action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V3_REPAIR_R2_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
