export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-stay-night-v5-vfx-20260822";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const VERSION = "CHURCHILL_STAY_FOR_THE_NIGHT_V5_AUTHENTIC_VFX_RUNTIME_R2";

const A = Object.freeze({
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  darts: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
  shuffle: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  shuffleRef: "4357898f-23fd-418f-af8d-89e3719c0969",
  singer: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
  stageVideo: "dcd86649-42f8-4f7a-be91-00c456eb940d",
});

const LOCK = `\n\nAUTHENTICITY LOCK: This is ONLY a VFX physics/transition plate for the real Churchill Restaurant & Bar in Karon, Phuket. Do not invent Churchill architecture, interiors, signage, logos, guests, singer, band, pool room, shuffleboard area or darts area. Do not generate readable text. Do not generate a traditional sisal/bristle/cork dartboard. Recognizable Churchill imagery is composited later from authentic sources. Leave physically plausible clean reflection/refraction/occlusion regions for editorial instead of painting fake Churchill scenes. Premium automotive/perfume/spirits commercial craft: photographic blacks, restrained amber practical highlights, deep burgundy wine where relevant, realistic glass/liquid/metal/wood optics, clean camera physics, fine-film contrast. No holograms, UI, cyberpunk, fantasy particles, neon redesign, AI shimmer, rubbery motion, captions or title cards.`;

const SCENES = Object.freeze({
  scene_03_wine_universe: {
    label: "WINE UNIVERSE",
    duration: 5,
    primary: null,
    references: [A.dinner, A.pool, A.darts, A.shuffle, A.band, A.singer],
    prompt: `Create a single photoreal 5-second 16:9 macro VFX plate. SCENE 03 WINE UNIVERSE. 0.00-0.70: warm darkness resolves into extreme macro real wine-glass / moving deep-red wine optics. 0.70-2.20: elegant wine motion releases several physically plausible suspended droplets. 2.20-3.80: camera threads between 2-3 droplets; one hero droplet dominates. Its curved surface has realistic refraction and several dark clean reflection cavities specifically intended for later authentic Churchill composites. 3.80-5.00: camera pushes through the hero droplet; wine wraps naturally around lens and resolves toward one warm dinner-table practical light for a hard match to authentic dinner footage. Do NOT generate miniature rooms, people, games, venue imagery or signage inside the droplets. Generate only world-class wine/glass/liquid physics and camera transition.` + LOCK,
    editorial: "Composite authentic Churchill dinner, pool, electronic darts, shuffleboard and real singer/band into the prepared optical reflection cavities.",
  },
  scene_05_steam_into_bar: {
    label: "STEAM INTO BAR",
    duration: 4,
    primary: null,
    references: [A.dinner],
    prompt: `Create a photoreal 4-second 16:9 transition VFX plate. SCENE 05 STEAM INTO BAR. Begin in a premium macro dining-light context without identifiable venue geometry. Natural hot-food steam grows across lens. Camera glides through believable warm steam; amber highlights and volumetric falloff remain photographic. Steam fills frame for one beat, then opens toward a dark warm practical-light region designed for editorial to reveal the authentic Churchill bar. Do not generate a bar, people, signs or architecture. The result is only a luxury steam/mist optical bridge.` + LOCK,
    editorial: "Use authentic Churchill dining/bar imagery as endpoints; generated content is only the steam bridge.",
  },
  scene_06_ice_time_freeze: {
    label: "ICE TIME FREEZE",
    duration: 5,
    primary: null,
    references: [A.dinner, A.pool],
    prompt: `Create a photoreal 5-second 16:9 macro freeze-time VFX plate. SCENE 06 ICE TIME FREEZE. Dark amber cocktail liquid and one clear ice cube enter frame. At impact time freezes: droplets and ice fragments suspend while camera alone moves between them. One hero cube rotates slowly with realistic condensation, caustics and optically clean internal volume for later authentic Churchill pool compositing. Camera pushes into the cube. Final second: its white highlight and curvature evolve naturally toward a cue-ball-like circular surface for a hard match to authentic Churchill pool footage. No bartender, guests, bar, venue or pool room generation.` + LOCK,
    editorial: "Composite authentic Churchill bar action and real pool room into the frozen liquid/ice optics; land on authentic pool footage.",
  },
  scene_08_pool_to_shuffleboard: {
    label: "POOL TO SHUFFLEBOARD",
    duration: 4,
    primary: null,
    references: [A.pool, A.shuffle, A.shuffleRef],
    prompt: `Create a photoreal 4-second 16:9 object-transition VFX plate. SCENE 08 POOL TO SHUFFLEBOARD. Extreme macro glossy pool-ball-like dark sphere crosses lens and fully occludes frame. During the natural blackout, motion language transforms into a polished shuffleboard-puck-like object. Camera emerges only centimeters above a real wood-like surface and chases behind the puck. Surroundings remain abstract, dark and non-identifying for editorial replacement with authentic Churchill shuffleboard. End on a clean forward-moving match point. No branding, score markings, people or venue generation.` + LOCK,
    editorial: "Start/end on authentic Churchill pool and shuffleboard assets; generated plate supplies only object handoff and occlusion.",
  },
  scene_09_shuffleboard_to_dart: {
    label: "SHUFFLEBOARD TO DART",
    duration: 4,
    primary: null,
    references: [A.shuffle, A.darts],
    prompt: `Create a photoreal 4-second 16:9 mechanical object-transition plate. SCENE 09 SHUFFLEBOARD TO DART. A dark metallic shuffleboard-puck-like object reaches a table edge in extreme close-up. As it tips and falls, rotation plus a brief foreground occlusion transforms it into a modern soft-tip electronic dart; mechanically plausible, never cartoon morphing. A cropped anonymous hand may catch it, with no face or identity. End on the soft-tip dart ready against a dark neutral background. No board visible, no traditional dartboard, no text or venue.` + LOCK,
    editorial: "Match authentic Churchill shuffleboard before it and authentic electronic darts after it.",
  },
  scene_10_electric_dart_flight: {
    label: "ELECTRIC DART FLIGHT",
    duration: 5,
    primary: A.darts,
    references: [A.darts, A.pool, A.shuffle, A.dinner, A.stageVideo],
    prompt: `Create a photoreal 5-second 16:9 high-speed VFX shot. SCENE 10 ELECTRIC DART FLIGHT. Viewer travels alongside/just behind a modern soft-tip electronic dart in flight. Preserve the electronic-darts identity from the single authentic source plate; do not redesign the venue. Keep surroundings shallow-focus and restrained, with several natural dark/blurred passing regions for authentic Churchill composites. The final target must remain modern ELECTRONIC darts only, never sisal/bristle/cork. No readable scoring text. Final 0.8 sec: center impact creates a clean circular illuminated ring that expands toward lens and becomes a stage-spotlight aperture for the next authentic band scene. No fake guests or faces.` + LOCK,
    editorial: "Use the authentic Churchill electronic-darts plate as the only generated source; composite other authentic Churchill layers editorially.",
  },
  scene_12_many_realities_same_night: {
    label: "MANY REALITIES SAME NIGHT",
    duration: 5,
    primary: null,
    references: [A.dinner, A.pool, A.shuffle, A.darts, A.stageVideo],
    prompt: `Create a photoreal 5-second 16:9 optical/time-transition VFX plate. SCENE 12 MANY REALITIES SAME NIGHT. Do not generate a venue or people. Camera moves continuously through dark warm practical reflections, glass edges, polished-wood highlights and natural foreground occlusions. Build 4-5 elegant physical reflection windows/moving masks intended to hold separate authentic Churchill moments in editorial. Never split-screen, hologram or UI. End by converging the reflection windows into one continuous dark-warm field for the freeze-time hero.` + LOCK,
    editorial: "Fill all time/reflection windows with authentic Churchill dinner, games and stage imagery only.",
  },
  scene_13_frozen_night_hero: {
    label: "FROZEN NIGHT HERO",
    duration: 5,
    primary: null,
    references: [A.dinner, A.pool, A.shuffle, A.darts, A.band, A.singer, A.stageVideo],
    prompt: `Create a photoreal 5-second 16:9 world-class freeze-time VFX plate. SCENE 13 FROZEN NIGHT HERO. Generate ONLY suspended physical elements and camera motion: realistic red-wine droplets, a frozen ribbon of cocktail liquid, one or two clear ice fragments, a polished pool-ball-like sphere, a shuffleboard-puck-like object and a modern soft-tip dart silhouette. Arrange them in strong cinematic depth with clean negative regions for later authentic Churchill food, games, singer, band and guest composites. One wine droplet remains subtly alive while all else is frozen. Final second: camera selects that droplet and pushes into its deep burgundy surface to form the return tunnel. No venue or people generation.` + LOCK,
    editorial: "Composite only authentic Churchill food, pool, shuffleboard, electronic darts, singer, drummer, band and guests into the plate.",
  },
});

function text(value) { return String(value ?? "").trim(); }
function json(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } }); }
function spec(sceneKey) {
  const value = SCENES[sceneKey];
  if (!value) throw new Error("CHURCHILL_V5_VFX_SCENE_UNSUPPORTED");
  return value;
}

async function project() {
  const { data, error } = await supabaseAdmin.from("creative_projects").select("*").eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V5_PROJECT_NOT_FOUND");
  return data;
}

async function activeCredentialId() {
  const { data, error } = await supabaseAdmin.from("provider_credentials").select("id").eq("provider_id", PROVIDER).eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error("CHURCHILL_V5_GEMINI_CREDENTIAL_REQUIRED");
  return data.id;
}

async function patchScene(p, sceneKey, value) {
  const metadata = p.metadata || {};
  const current = metadata.churchill_v5_scenes || {};
  const next = {
    ...current,
    version: VERSION,
    public_line: "COME FOR DINNER. STAY FOR THE NIGHT.",
    concept: "THE NIGHT INSIDE THE NIGHT",
    scenes: { ...(current.scenes || {}), [sceneKey]: value },
    story_change_authorized: true,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("creative_projects").update({ metadata: { ...metadata, churchill_v5_scenes: next }, updated_at: new Date().toISOString() }).eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

function generationInput(s, p, credentialId) {
  const input = {
    model: MODEL,
    prompt: s.prompt,
    provider_prompt: s.prompt,
    media_duration_seconds: s.duration,
    duration_seconds: s.duration,
    output_spec: { duration_seconds: s.duration, aspect_ratio: "16:9" },
    generation: { model: MODEL, output_spec: { duration_seconds: s.duration, aspect_ratio: "16:9" } },
    provider_parameters: { aspect_ratio: "16:9" },
    creative_project_id: PROJECT_ID,
    creative_mission_id: p.creative_mission_id || null,
    credential_id: credentialId,
    quantity: s.duration,
    currency: "THB",
  };
  if (s.primary) {
    input.primary_source_asset_id = s.primary;
    input.source = s.primary;
    input.selected_assets = [s.primary];
    input.provider_parameters.primary_source_asset_id = s.primary;
  }
  return input;
}

async function start(sceneKey) {
  const s = spec(sceneKey);
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[sceneKey] || null;
  if (current?.status === "COMPLETED" && current?.output_reference) return { success: true, reused: true, scene: sceneKey, state: current };
  if (current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) return { success: true, reused: true, scene: sceneKey, state: current };

  const credentialId = await activeCredentialId();
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: generationInput(s, p, credentialId),
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V5_${sceneKey.toUpperCase()}`,
      version: VERSION,
      creative_project_id: PROJECT_ID,
      scene_key: sceneKey,
      authentic_reference_asset_ids: s.references,
      generated_plate_only: true,
      source_binding_mode: s.primary ? "EXPLICIT_PRIMARY_SOURCE_ONLY" : "TEXT_TO_VIDEO_VFX_PLATE",
      authentic_editorial_composite_required: true,
      generated_venue_replacement_allowed: false,
      generated_people_allowed: false,
      generated_logo_allowed: false,
      traditional_dartboard_allowed: false,
      editorial_instruction: s.editorial,
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
    credential_id: result?.credential_id || credentialId,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    source_duration_seconds: s.duration,
    final_editorial_duration_seconds: s.duration,
    primary_source_asset_id: s.primary,
    authentic_reference_asset_ids: s.references,
    generated_plate_only: true,
    authentic_editorial_composite_required: true,
    editorial_instruction: s.editorial,
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || null),
    visual_review_complete: false,
    approved_for_master: false,
    publication_authorized: false,
  };
  await patchScene(p, sceneKey, state);
  return { success: true, reused: false, scene: sceneKey, state };
}

async function poll(sceneKey) {
  const s = spec(sceneKey);
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[sceneKey] || null;
  if (!current) throw new Error("CHURCHILL_V5_VFX_SCENE_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) return { success: true, pending: false, reused: true, scene: sceneKey, state: current };
  if (!current.provider_job_id || !current.usage_id) throw new Error("CHURCHILL_V5_VFX_PENDING_STATE_INCOMPLETE");

  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: current.provider || PROVIDER,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: { model: current.model || MODEL, creative_project_id: PROJECT_ID, creative_mission_id: p.creative_mission_id || null },
    metadata: { module: "CREATIVE", operation: `CHURCHILL_V5_${sceneKey.toUpperCase()}_POLL`, version: VERSION, creative_project_id: PROJECT_ID, scene_key: sceneKey, publication_authorized: false },
  });

  if (result?.failed) {
    const failed = { ...current, status: "FAILED", provider_status: result.provider_status || "failed", error: result.error || `${s.label} generation failed`, completed_at: new Date().toISOString() };
    await patchScene(p, sceneKey, failed);
    return { success: false, failed: true, pending: false, scene: sceneKey, state: failed };
  }
  if (result?.pending) {
    const pending = { ...current, status: "PROCESSING", provider_status: result.provider_status || "processing", last_polled_at: new Date().toISOString() };
    await patchScene(p, sceneKey, pending);
    return { success: true, pending: true, scene: sceneKey, state: pending };
  }

  const outputReference = result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || result?.output?.raw?.output?.file_url || null;
  if (!outputReference) throw new Error("CHURCHILL_V5_VFX_OUTPUT_REQUIRED");
  const complete = { ...current, status: "COMPLETED", provider_status: result.provider_status || "completed", settlement: result.settlement || null, pricing: result.pricing || current.pricing || null, output_reference: outputReference, completed_at: new Date().toISOString(), error: null };
  await patchScene(p, sceneKey, complete);
  return { success: true, pending: false, scene: sceneKey, state: complete };
}

async function status(sceneKey) {
  const s = spec(sceneKey);
  const p = await project();
  return {
    success: true,
    version: VERSION,
    scene: sceneKey,
    label: s.label,
    state: p.metadata?.churchill_v5_scenes?.scenes?.[sceneKey] || { status: "NOT_STARTED" },
    policy: { generated_plate_only: true, authentic_editorial_composite_required: true, generated_venue_replacement_allowed: false, generated_people_allowed: false, generated_logo_allowed: false, traditional_dartboard_allowed: false, visual_review_required: true, publication_authorized: false },
  };
}

async function video(sceneKey) {
  const s = spec(sceneKey);
  const p = await project();
  const state = p.metadata?.churchill_v5_scenes?.scenes?.[sceneKey] || null;
  const ref = text(state?.output_reference);
  if (state?.status !== "COMPLETED" || !ref) return json({ success: false, error: "CHURCHILL_V5_VFX_VIDEO_NOT_READY" }, 409);
  if (ref.startsWith("storage://")) {
    const parts = ref.slice("storage://".length).split("/").filter(Boolean);
    const bucket = parts.shift();
    const path = parts.join("/");
    if (!bucket || !path) throw new Error("CHURCHILL_V5_VFX_STORAGE_REFERENCE_INVALID");
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error) throw error;
    return new Response(await data.arrayBuffer(), { status: 200, headers: { "Content-Type": "video/mp4", "Content-Disposition": `inline; filename="churchill-v5-${sceneKey}-${s.label.toLowerCase().replaceAll(" ", "-")}.mp4"`, "Cache-Control": "private, no-store" } });
  }
  if (/^https?:\/\//.test(ref)) {
    const upstream = await fetch(ref, { cache: "no-store" });
    if (!upstream.ok) throw new Error(`CHURCHILL_V5_VFX_UPSTREAM_${upstream.status}`);
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": upstream.headers.get("content-type") || "video/mp4", "Content-Disposition": `inline; filename="churchill-v5-${sceneKey}-${s.label.toLowerCase().replaceAll(" ", "-")}.mp4"`, "Cache-Control": "private, no-store" } });
  }
  throw new Error("CHURCHILL_V5_VFX_OUTPUT_REFERENCE_UNSUPPORTED");
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const sceneKey = text(url.searchParams.get("scene"));
    spec(sceneKey);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status(sceneKey));
    if (action === "start") return json(await start(sceneKey));
    if (action === "poll") return json(await poll(sceneKey));
    if (action === "video") return await video(sceneKey);
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V5_VFX_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
