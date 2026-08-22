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
const TOKEN = "churchill-night-changes-v3-dart-r2b-20260822";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const VERSION = "CHURCHILL_V3_DART_R2B_EDITORIAL_3S";
const TRUTH_ASSET_ID = "7bc9e891-e3d0-4b03-8b53-95ff255f31c6";
const TRUTH_ROLE = "AUTHENTIC_POOL_ELECTRIC_DARTS_GEOMETRY_TRUTH";

const COMMON = [
  "Premium photoreal hospitality cinema, restrained and elegant.",
  "The supplied Churchill games-room reference is immutable geometry truth.",
  "Preserve the exact orange/amber Churchill pool tables and the real ELECTRONIC dart machines with illuminated targets, cabinets and scoring screens.",
  "No traditional dartboard, no sisal/bristle/cork/vintage board, no standalone round target without cabinet/screens.",
  "Do not redesign the room, furniture, walls, proportions or practical lighting.",
  "No cyberpunk, no fantasy energy, no neon trails, no particles, no sparks, no fake signage, no fake logo, no glossy AI showroom look.",
  "Camera movement is minimal and deliberate. The dart provides the action.",
].join(" ");

const SHOTS = Object.freeze({
  dart_entry_r2b: Object.freeze({
    seconds: 3,
    prompt: `${COMMON} Start with a brief dark foreground occlusion that can cut seamlessly from the real shuffleboard puck wipe. As it clears, one modern dart crosses close to camera in a physically plausible straight line. Keep camera nearly fixed. The authentic orange Churchill pool table and electronic dart cabinets/screens remain clearly recognisable behind it. No people. No room warping. No camera fly-through.`,
  }),
  dart_midflight_r2b: Object.freeze({
    seconds: 3,
    prompt: `${COMMON} Use a compressed long-lens commercial perspective in this exact Churchill room. A single modern dart crosses the middle depth toward the authentic electronic target. Camera performs only a subtle controlled forward drift. The orange pool table stays foreground context and the electronic dart cabinets/screens remain clearly electronic. No exaggerated speed ramp, no impossible POV, no geometry changes.`,
  }),
  dart_impact_r2b: Object.freeze({
    seconds: 3,
    prompt: `${COMMON} Compose a refined telephoto push toward the exact authentic electronic dart machine. One modern dart arrives and impacts the real electronic target. The cabinet and scoring screens stay visible enough that nobody can mistake it for traditional darts. At impact allow only a very brief practical exposure bloom from the existing circular target illumination, suitable for a match cut into the real Churchill stage spotlight. No explosion and no fantasy effect.`,
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
  if (!mission?.id) throw new Error("CHURCHILL_V3_DART_R2B_MISSION_REQUIRED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_DART_R2B_PROJECT_REQUIRED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_DART_R2B_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function validateTruthAsset() {
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,ai_generated,metadata")
    .eq("id", TRUTH_ASSET_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_DART_R2B_TRUTH_ASSET_MISSING");
  if (data.ai_generated === true) throw new Error("CHURCHILL_V3_DART_R2B_TRUTH_ASSET_MUST_BE_REAL");
  if (data.metadata?.truth_role !== TRUTH_ROLE) throw new Error("CHURCHILL_V3_DART_R2B_TRUTH_ROLE_INVALID");
}

async function credentialId() {
  const { data, error } = await supabaseAdmin
    .from("provider_credentials")
    .select("id")
    .eq("provider_id", PROVIDER)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("CHURCHILL_V3_DART_R2B_GEMINI_CREDENTIAL_REQUIRED");
  return data.id;
}

function root(metadata = {}) {
  return metadata.churchill_v3_dart_r2b || {};
}

async function patch(p, key, value, status = "R2B_ACTIVE") {
  const metadata = p.metadata || {};
  const current = root(metadata);
  const next = {
    ...current,
    version: VERSION,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    strategy: "THREE_SHORT_AUTHENTIC_DART_PLATES",
    truth_asset_id: TRUTH_ASSET_ID,
    story_change_authorized: false,
    publication_authorized: false,
    status,
    generations: { ...(current.generations || {}), [key]: value },
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, churchill_v3_dart_r2b: next }, updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_DART_R2B_SHOT_INVALID");
  const p = await project();
  await validateTruthAsset();
  const current = root(p.metadata).generations?.[key] || null;
  if (current?.version === VERSION && current?.status === "COMPLETED" && current?.output_reference) return { success: true, reused: true, key, state: current };
  if (current?.version === VERSION && current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) return { success: true, reused: true, key, state: current };

  const cred = await credentialId();
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: {
      model: MODEL,
      primary_source_asset_id: TRUTH_ASSET_ID,
      source: TRUTH_ASSET_ID,
      selected_assets: [TRUTH_ASSET_ID],
      prompt: shot.prompt,
      provider_prompt: shot.prompt,
      media_duration_seconds: shot.seconds,
      duration_seconds: shot.seconds,
      output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9" },
      generation: { model: MODEL, output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9" } },
      provider_parameters: { aspect_ratio: "16:9", primary_source_asset_id: TRUTH_ASSET_ID },
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
      credential_id: cred,
      quantity: shot.seconds,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_DART_R2B_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      version: VERSION,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      generation_key: key,
      truth_asset_id: TRUTH_ASSET_ID,
      truth_role: TRUTH_ROLE,
      story_change_authorized: false,
      publication_authorized: false,
    },
    category: "AI",
  });

  const state = {
    version: VERSION,
    status: result?.pending ? "PROCESSING" : "COMPLETED",
    provider: result?.provider || PROVIDER,
    model: result?.model || MODEL,
    provider_job_id: result?.provider_job_id || result?.output?.provider_job_id || null,
    provider_status: result?.provider_status || result?.output?.status || null,
    usage_id: result?.usage?.id || null,
    credential_id: result?.credential_id || cred,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    duration_seconds: shot.seconds,
    truth_asset_id: TRUTH_ASSET_ID,
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || result?.output?.url || null),
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_DART_R2B_SHOT_INVALID");
  const p = await project();
  const current = root(p.metadata).generations?.[key] || null;
  if (!current) throw new Error("CHURCHILL_V3_DART_R2B_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) return { success: true, pending: false, reused: true, key, state: current };
  if (current.status === "FAILED") return { success: false, pending: false, failed: true, key, state: current };

  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: PROVIDER,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: { model: current.model || MODEL, creative_project_id: p.id, creative_mission_id: p.creative_mission_id || null },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_DART_R2B_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      version: VERSION,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      generation_key: key,
      truth_asset_id: TRUTH_ASSET_ID,
      story_change_authorized: false,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = { ...current, status: "FAILED", provider_status: result.provider_status || "failed", error: result.error || "R2B failed", completed_at: new Date().toISOString() };
    await patch(p, key, failed, "R2B_FAILED");
    return { success: false, failed: true, pending: false, key, state: failed };
  }
  if (result?.pending) {
    const pending = { ...current, status: "PROCESSING", provider_status: result.provider_status || "processing", last_polled_at: new Date().toISOString() };
    await patch(p, key, pending);
    return { success: true, pending: true, key, state: pending };
  }

  const outputReference = result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || result?.output?.raw?.output?.file_url || null;
  if (!outputReference) throw new Error("CHURCHILL_V3_DART_R2B_OUTPUT_REQUIRED");
  const completed = { ...current, status: "COMPLETED", provider_status: result.provider_status || "completed", output_reference: outputReference, settlement: result.settlement || null, pricing: result.pricing || current.pricing || null, completed_at: new Date().toISOString(), error: null };
  await patch(p, key, completed, "R2B_REVIEW_REQUIRED");
  return { success: true, pending: false, key, state: completed };
}

async function status() {
  const p = await project();
  const state = root(p.metadata);
  return {
    success: true,
    version: VERSION,
    strategy: "THREE_SHORT_AUTHENTIC_DART_PLATES",
    truth_asset_id: TRUTH_ASSET_ID,
    generations: state.generations || {},
    story_change_authorized: false,
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
    if (action === "start") return json(await start(shot));
    if (action === "poll") return json(await poll(shot));
    return json({ success: false, error: "Invalid action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V3_DART_R2B_FAILED", { message: error?.message || String(error) });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
