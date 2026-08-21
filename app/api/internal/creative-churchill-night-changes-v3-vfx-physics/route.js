export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v3-vfx-physics-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";

const A = Object.freeze({
  carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
});

const COMMON = "Photoreal world-class hospitality commercial cinematography. Premium practical optics, physically coherent materials and camera motion. No people, no faces, no celebrities, no likenesses, no logos, no readable text, no hologram UI, no cyberpunk, no fantasy architecture, no cartoon physics.";

const SHOTS = Object.freeze({
  wine_universe: Object.freeze({
    seconds: 7,
    source: null,
    composite_mode: "AUTHENTIC_REFLECTION_INSERTS_IN_POST",
    prompt: `${COMMON} Extreme macro cinematic red-wine universe on a dark warm restaurant table. A beautiful crystal wine glass and deep red wine move in slow motion. Time appears to stop and several perfectly realistic red-wine droplets become suspended in warm amber practical light. Each droplet has clear curved reflective surfaces intentionally suitable for later compositing of tiny real-world reflections. Camera moves elegantly between droplets, chooses one large droplet, approaches its refractive surface and passes through the liquid into a warm abstract bokeh transition. The liquid must look genuinely photographed with surface tension, caustics, refraction and micro-condensation. Make at least one hero droplet large, stable and clean enough for an authentic venue reflection to be composited inside it later.`,
  }),
  steam_into_bar: Object.freeze({
    seconds: 4,
    source: A.carpaccio,
    composite_mode: "AUTHENTIC_FOOD_SOURCE",
    prompt: `${COMMON} Start from the supplied real food image. Preserve the actual dish. Perform an elegant macro glide over plate highlights and steam. The steam naturally becomes denser until it fills the lens and resolves into warm amber restaurant/bar atmosphere with soft practical bokeh, leaving a clean mist-filled exit frame for editorial continuation. Do not invent a different dish.`,
  }),
  ice_time_freeze: Object.freeze({
    seconds: 8,
    source: null,
    composite_mode: "AUTHENTIC_POOL_REFRACTION_IN_POST",
    prompt: `${COMMON} Signature frozen-time cocktail physics shot. A cut-crystal tumbler with amber drink, one large transparent ice cube, smaller ice fragments and liquid droplets explode gracefully upward in macro slow motion, then everything freezes perfectly in mid-air while the camera alone continues moving. Travel between suspended droplets and around the large crystal-clear ice cube. The large cube must have a clean broad refractive face intentionally suitable for inserting a real billiards-room reflection in post. Camera then moves through the ice cube; its white highlight expands until the cube visually match-transforms into the circular white surface of a cue ball. Realistic condensation, refraction, caustics and physically correct liquid surface tension. No people.`,
  }),
  pool_to_shuffleboard: Object.freeze({
    seconds: 5,
    source: A.pool,
    composite_mode: "AUTHENTIC_POOL_SOURCE_EXACT_SHUFFLEBOARD_LANDING_IN_POST",
    prompt: `${COMMON} Start from the supplied authentic billiards table image. Preserve table geometry and warm amber visual character. A white cue ball rolls very close toward lens until it completely fills and occludes the frame. Continue the camera through the circular foreground wipe into an extremely low smooth tracking move over polished warm wood, visually prepared to match-cut into a real shuffleboard puck. Keep geometry stable and plausible.`,
  }),
  shuffleboard_to_dart: Object.freeze({
    seconds: 4,
    source: A.shuffleboard,
    composite_mode: "AUTHENTIC_SHUFFLEBOARD_SOURCE",
    prompt: `${COMMON} Start from the supplied authentic shuffleboard table. Preserve its long wooden geometry and scoring surface. Camera tracks a real metal puck toward the scoring end. As the puck reaches the edge and falls through foreground, its circular metal body performs one physically believable match transformation into a modern steel-tipped dart in motion. The dart exits frame cleanly. No hand and no person; a real hand can be inserted editorially afterward.`,
  }),
  electric_dart_flight: Object.freeze({
    seconds: 7,
    source: null,
    composite_mode: "AUTHENTIC_CHURCHILL_AND_ELECTRONIC_DARTS_INSERTS_IN_POST",
    prompt: `${COMMON} High-speed cinematic point-of-view flight travelling with a modern dart through a warm premium interior made mostly from abstract practical-light corridors, foreground occlusions and shallow-focus wood/amber textures designed for later insertion of authentic venue frames. Finish on unmistakably modern ELECTRONIC darts visual language only: a glowing circular electronic target, digital score-screen glow and contemporary machine lighting. Traditional sisal, bristle, cork and vintage dartboards are absolutely forbidden. At the center impact, motion stops for a fraction, then the circular electronic light blooms to fill the entire frame as a practical stage-spotlight transition. No people.`,
  }),
  frozen_night_hero: Object.freeze({
    seconds: 7,
    source: null,
    composite_mode: "MULTILAYER_AUTHENTIC_CHURCHILL_FREEZE_COMPOSITE_IN_POST",
    prompt: `${COMMON} Create the physical-effects backbone for an impossible frozen-night hero shot with no people. One continuous elegant camera move passes through suspended red wine mid-pour, amber cocktail liquid, transparent ice fragments, polished cutlery, steam, a white billiards ball frozen in motion, a metal shuffleboard puck frozen in motion and a modern dart suspended in flight. Warm restaurant/stage practical lights remain frozen as dimensional bokeh. At the end, every object is perfectly still except one tiny red-wine droplet that continues moving. The camera approaches that droplet; it has a broad clean reflective surface suitable for inserting a real moving venue reflection in post, then camera enters it. Photoreal large-budget time-freeze VFX plate, physically coherent and designed for later compositing of authentic people and venue layers.`,
  }),
});

function text(value) { return String(value ?? "").trim(); }
function json(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } }); }

function assertCatalog() {
  assertChurchillNightStoryIntegrity();
  const required = ["wine_universe","steam_into_bar","ice_time_freeze","pool_to_shuffleboard","shuffleboard_to_dart","electric_dart_flight","frozen_night_hero"];
  const missing = required.filter((key) => !SHOTS[key]);
  if (missing.length) throw new Error(`CHURCHILL_V3_PHYSICS_CATALOG_MISSING:${missing.join(",")}`);
}

async function project() {
  assertCatalog();
  const { data: mission, error: missionError } = await supabaseAdmin.from("creative_missions").select("id").eq("organization_id", ORGANIZATION_ID).eq("metadata->>command_identity", COMMAND_IDENTITY).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_V3_PROJECT_NOT_PREPARED");
  const { data, error } = await supabaseAdmin.from("creative_projects").select("*").eq("organization_id", ORGANIZATION_ID).eq("creative_mission_id", mission.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_PROJECT_NOT_PREPARED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) throw new Error("CHURCHILL_V3_STORY_VERSION_MISMATCH");
  return data;
}

async function credentialId() {
  const { data, error } = await supabaseAdmin.from("provider_credentials").select("id").eq("provider_id", PROVIDER).eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("CHURCHILL_V3_GEMINI_CREDENTIAL_REQUIRED");
  return data.id;
}

async function patch(p, key, value) {
  const metadata = p.metadata || {};
  const current = metadata.churchill_v3_vfx || {};
  const next = {
    ...current,
    provider: PROVIDER,
    model: MODEL,
    story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    execution_architecture: "PHYSICS_PLATES_PLUS_AUTHENTIC_POST_COMPOSITES",
    shots: { ...(current.shots || {}), [key]: value },
    provider_fallback_changes_story: false,
    identity_regeneration_forbidden: true,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("creative_projects").update({ metadata: { ...metadata, churchill_v3_vfx: next }, updated_at: new Date().toISOString() }).eq("id", p.id).eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

function serviceInput(shot, p, credential) {
  const input = {
    model: MODEL,
    prompt: shot.prompt,
    provider_prompt: shot.prompt,
    media_duration_seconds: shot.seconds,
    duration_seconds: shot.seconds,
    output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9" },
    generation: { model: MODEL, output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9" } },
    provider_parameters: { aspect_ratio: "16:9" },
    creative_project_id: p.id,
    creative_mission_id: p.creative_mission_id || null,
    credential_id: credential,
    quantity: shot.seconds,
    currency: "THB",
  };
  if (shot.source) {
    input.primary_source_asset_id = shot.source;
    input.source = shot.source;
    input.selected_assets = [shot.source];
    input.provider_parameters.primary_source_asset_id = shot.source;
  }
  return input;
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_PHYSICS_SHOT_INVALID");
  const p = await project();
  const current = p.metadata?.churchill_v3_vfx?.shots?.[key] || null;
  if (current?.status === "COMPLETED" && current?.output_reference) return { success: true, reused: true, key, state: current };
  if (current?.status === "PROCESSING" && current?.provider === PROVIDER && current?.provider_job_id && current?.usage_id) return { success: true, reused: true, key, state: current };

  const credential = await credentialId();
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: serviceInput(shot, p, credential),
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_PHYSICS_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      shot_key: key,
      source_asset_id: shot.source,
      composite_mode: shot.composite_mode,
      generated_people_allowed: false,
      authentic_identity_composite_required: true,
      provider_fallback_changes_story: false,
      story_change_authorized: false,
      publication_authorized: false,
    },
    category: "AI",
  });

  const state = {
    status: result?.pending ? "PROCESSING" : "COMPLETED",
    provider: result?.provider || PROVIDER,
    model: result?.model || MODEL,
    provider_job_id: result?.provider_job_id || result?.output?.provider_job_id || null,
    provider_status: result?.provider_status || result?.output?.status || null,
    usage_id: result?.usage?.id || null,
    credential_id: result?.credential_id || credential,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    duration_seconds: shot.seconds,
    source_asset_id: shot.source,
    composite_mode: shot.composite_mode,
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || result?.output?.url || null),
    generated_people_allowed: false,
    authentic_identity_composite_required: true,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    provider_fallback_changes_story: false,
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  if (!SHOTS[key]) throw new Error("CHURCHILL_V3_PHYSICS_SHOT_INVALID");
  const p = await project();
  const current = p.metadata?.churchill_v3_vfx?.shots?.[key] || null;
  if (!current) throw new Error("CHURCHILL_V3_PHYSICS_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) return { success: true, pending: false, reused: true, key, state: current };
  if (current.provider !== PROVIDER || !current.provider_job_id || !current.usage_id) throw new Error("CHURCHILL_V3_PHYSICS_PENDING_STATE_INCOMPLETE");

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
      operation: `CHURCHILL_V3_PHYSICS_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      shot_key: key,
      composite_mode: current.composite_mode,
      generated_people_allowed: false,
      authentic_identity_composite_required: true,
      provider_fallback_changes_story: false,
      story_change_authorized: false,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = { ...current, status: "FAILED", provider_status: result.provider_status || "failed", error: result.error || "Gemini physics generation failed", completed_at: new Date().toISOString() };
    await patch(p, key, failed);
    return { success: false, failed: true, pending: false, key, state: failed };
  }
  if (result?.pending) {
    const pending = { ...current, status: "PROCESSING", provider_status: result.provider_status || "processing", last_polled_at: new Date().toISOString() };
    await patch(p, key, pending);
    return { success: true, pending: true, key, state: pending };
  }

  const outputReference = result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || result?.output?.raw?.output?.file_url || null;
  if (!outputReference) throw new Error("CHURCHILL_V3_PHYSICS_COMPLETED_OUTPUT_REQUIRED");
  const complete = { ...current, status: "COMPLETED", provider_status: result.provider_status || "completed", settlement: result.settlement || null, pricing: result.pricing || current.pricing || null, output_reference: outputReference, completed_at: new Date().toISOString(), error: null };
  await patch(p, key, complete);
  return { success: true, pending: false, key, state: complete };
}

async function status() {
  const p = await project();
  const stored = p.metadata?.churchill_v3_vfx?.shots || {};
  return {
    success: true,
    provider: PROVIDER,
    model: MODEL,
    architecture: "PHYSICS_PLATES_PLUS_AUTHENTIC_POST_COMPOSITES",
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    shots: Object.fromEntries(Object.keys(SHOTS).map((key) => [key, stored[key] || { status: "NOT_STARTED" }])),
    policy: { generated_people_allowed: false, authentic_identity_composite_required: true, provider_fallback_changes_story: false, publication_authorized: false },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const shot = text(url.searchParams.get("shot"));
    if (action === "status") return json(await status());
    if (action === "start") { if (!shot) return json({ success: false, error: "shot required" }, 400); return json(await start(shot)); }
    if (action === "poll") { if (!shot) return json({ success: false, error: "shot required" }, 400); return json(await poll(shot)); }
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V3_PHYSICS_VFX_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
