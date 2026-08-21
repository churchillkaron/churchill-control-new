export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CHURCHILL_NIGHT_CHANGES_STORY,
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v3-vfx-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
const PROVIDER = "runway";
const MODEL = "gen4.5";

const A = Object.freeze({
  entrance: "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  singer: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
  logo: "f2e57100-1b78-43c9-b080-1c7945fc4d23",
});

const COMMON =
  "Photoreal world-class hospitality/commercial cinematography. Churchill remains authentic. Never redesign the venue, logo, singer, band, pool, shuffleboard or food. No hologram UI, no cyberpunk, no generic luxury lounge, no fake signage, no invented logo, no traditional/sisal/bristle/cork/vintage dartboard, no rubbery faces, no warped furniture, no cartoon physics. Impossible effects must look physically photographed.";

const SHOTS = Object.freeze({
  wine_universe: Object.freeze({
    seconds: 7,
    opening: A.dinner,
    editorial_end: A.dinner,
    prompt:
      `${COMMON} Begin from the supplied authentic Churchill dinner world. Move into an extreme macro of a real wine glass and red wine. Time slows until several suspended red-wine droplets hang in warm light. Inside the droplets are tiny physically plausible reflected glimpses of Churchill dinner, pool, shuffleboard, electronic darts and live stage. One droplet briefly contains the protected singer as a reflection only; do not generate a new singer face. Camera chooses one droplet and passes through its liquid surface, resolving back toward authentic Churchill dinner. Amber light from the Churchill brand should appear only as natural refraction. This must be a screenshot-worthy luxury film moment, not fantasy graphics.`,
  }),
  steam_into_bar: Object.freeze({
    seconds: 4,
    opening: A.carpaccio,
    editorial_end: A.dinner,
    prompt:
      `${COMMON} Start on the supplied real Churchill food. Perform a macro glide across the dish, polished sauce and steam. The steam grows naturally until it fills the lens, then becomes warm atmospheric mist in Churchill's bar world. The move must feel like one continuous practical camera event. Do not invent new dishes, architecture, signage or people. End on a neutral warm foreground/mist composition so the editor can land on real Churchill bar/dinner footage.`,
  }),
  ice_time_freeze: Object.freeze({
    seconds: 8,
    opening: A.dinner,
    editorial_end: A.pool,
    prompt:
      `${COMMON} Signature VFX sequence. In a warm authentic Churchill bar/dinner atmosphere, a realistic cocktail/ice action triggers freeze-time. Ice cubes, droplets and amber liquid become suspended in mid-air while the camera alone continues moving. Travel between individual droplets and through one crystal-clear ice cube in extreme macro. Inside the ice cube, the supplied authentic Churchill pool room appears as a realistic refraction. Rotate through the ice and make the cube become the white cue ball as motion resumes. Keep all people background and stable; do not invent hero faces. This is a premium frozen-time physics shot with realistic optics, condensation and liquid behavior.`,
  }),
  pool_to_shuffleboard: Object.freeze({
    seconds: 5,
    opening: A.pool,
    editorial_end: A.shuffleboard,
    prompt:
      `${COMMON} Start from the supplied authentic Churchill pool room. A real pool ball rolls very close to camera and completely occludes lens. Continue seamlessly into an extremely low tracking shot only a few centimeters above the supplied real Churchill shuffleboard. The pool ball becomes the shuffleboard puck through the occlusion. Preserve the real warm wood, table proportions and scoring geometry. End stable on the authentic shuffleboard perspective.`,
  }),
  shuffleboard_to_dart: Object.freeze({
    seconds: 4,
    opening: A.shuffleboard,
    editorial_end: A.shuffleboard,
    prompt:
      `${COMMON} Start on the supplied authentic Churchill shuffleboard. Track the puck toward the scoring end. As the puck reaches the edge and falls, use a tight foreground match transformation: its circular metal body elongates naturally into a dart in motion. A human hand catches the dart cleanly. Do not show a dartboard yet. Keep the transformation physically elegant and fast, never cartoonish.`,
  }),
  electric_dart_flight: Object.freeze({
    seconds: 7,
    opening: A.pool,
    editorial_end: A.band,
    prompt:
      `${COMMON} High-energy action sequence. Viewer travels with a dart through authentic Churchill layers: warm dining, real pool, real shuffleboard and stage preparation. Electronic darts only: the final target language must be a modern illuminated electronic dartboard with score-screen context. Traditional/sisal/bristle/cork/vintage dartboards are absolutely forbidden. As the dart reaches electronic bullseye, hold a split-second visual impact, then the circular illuminated electronic target expands into a practical stage spotlight. Do not generate or replace singer/band faces; end in a bright lens/spotlight fill so the editor can cut directly to the supplied real band frame.`,
  }),
  frozen_night_hero: Object.freeze({
    seconds: 7,
    opening: A.dinner,
    editorial_end: A.dinner,
    prompt:
      `${COMMON} Biggest hero shot. The entire Churchill night is frozen in one impossible continuous camera move. Move through authentic Churchill layers containing: wine suspended mid-pour, cocktail liquid and ice suspended, real food/cutlery action frozen, pool ball in motion, shuffleboard puck moving, an electronic dart travelling, live musicians frozen mid-performance and guests frozen mid-laugh/dance. Protect singer and band identity; no generated close-up or replacement faces. One small red-wine droplet remains moving while everything else is frozen; inside it is a tiny moving Churchill reality. Camera approaches and enters that droplet to prepare the loop back to dinner. Make this expensive, photoreal and physically coherent.`,
  }),
});

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function text(value) {
  return String(value ?? "").trim();
}

function assertCatalog() {
  assertChurchillNightStoryIntegrity();
  const required = [
    "wine_universe",
    "steam_into_bar",
    "ice_time_freeze",
    "pool_to_shuffleboard",
    "shuffleboard_to_dart",
    "electric_dart_flight",
    "frozen_night_hero",
  ];
  const missing = required.filter((key) => !SHOTS[key]);
  if (missing.length) throw new Error(`CHURCHILL_V3_VFX_CATALOG_MISSING:${missing.join(",")}`);
  return true;
}

async function project() {
  assertCatalog();
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_V3_PROJECT_NOT_PREPARED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V3_PROJECT_NOT_PREPARED");
  if (data.metadata?.canonical_story_version !== CHURCHILL_NIGHT_CHANGES_STORY_VERSION) {
    throw new Error("CHURCHILL_V3_CANONICAL_STORY_VERSION_MISMATCH");
  }
  return data;
}

async function patch(p, key, value) {
  const metadata = p.metadata || {};
  const current = metadata.churchill_v3_vfx || {};
  const next = {
    ...current,
    provider: PROVIDER,
    model: MODEL,
    story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    shots: {
      ...(current.shots || {}),
      [key]: value,
    },
    provider_fallback_changes_story: false,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_v3_vfx: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_VFX_SHOT_INVALID");
  const p = await project();
  const current = p.metadata?.churchill_v3_vfx?.shots?.[key] || null;
  if (current?.status === "COMPLETED" && current?.output_reference) {
    return { success: true, reused: true, key, state: current };
  }
  if (current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) {
    return { success: true, reused: true, key, state: current };
  }

  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: {
      model: MODEL,
      source: shot.opening,
      selected_assets: [shot.opening],
      prompt: shot.prompt,
      description: shot.prompt,
      duration_seconds: shot.seconds,
      aspect_ratio: "16:9",
      resolution: "720p",
      generation: { model: MODEL, provider_parameters: { duration: shot.seconds, aspect_ratio: "16:9" } },
      output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9", resolution: "720p" },
      provider_parameters: { duration: shot.seconds, aspect_ratio: "16:9" },
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
      quantity: shot.seconds,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      shot_key: key,
      opening_asset_id: shot.opening,
      editorial_end_asset_id: shot.editorial_end,
      story_change_authorized: false,
      provider_fallback_changes_story: false,
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
    credential_id: result?.credential_id || null,
    pricing: result?.pricing || null,
    queue: result?.output?.queue || result?.queue || null,
    started_at: result?.started_at || new Date().toISOString(),
    duration_seconds: shot.seconds,
    opening_asset_id: shot.opening,
    editorial_end_asset_id: shot.editorial_end,
    output_reference: result?.pending
      ? null
      : (result?.output?.video_url || result?.output?.file_url || result?.output?.url || result?.output?.result || null),
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    story_change_authorized: false,
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  if (!SHOTS[key]) throw new Error("CHURCHILL_V3_VFX_SHOT_INVALID");
  const p = await project();
  const current = p.metadata?.churchill_v3_vfx?.shots?.[key] || null;
  if (!current) throw new Error("CHURCHILL_V3_VFX_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, key, state: current };
  }
  if (!current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_V3_VFX_PENDING_STATE_INCOMPLETE");
  }

  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: current.provider || PROVIDER,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: {
      model: current.model || MODEL,
      ...(current.queue || {}),
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      shot_key: key,
      story_change_authorized: false,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Provider generation failed",
      completed_at: new Date().toISOString(),
    };
    await patch(p, key, failed);
    return { success: false, failed: true, pending: false, key, state: failed };
  }
  if (result?.pending) {
    const pending = {
      ...current,
      status: "PROCESSING",
      provider_status: result.provider_status || "processing",
      queue: result.queue || current.queue || null,
      last_polled_at: new Date().toISOString(),
    };
    await patch(p, key, pending);
    return { success: true, pending: true, key, state: pending };
  }

  const outputReference =
    result?.output?.url ||
    result?.output?.video_url ||
    result?.output?.file_url ||
    result?.output?.result ||
    (Array.isArray(result?.output) ? result.output[0] : null) ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_V3_VFX_COMPLETED_OUTPUT_REQUIRED");

  const complete = {
    ...current,
    status: "COMPLETED",
    provider_status: result.provider_status || "completed",
    settlement: result.settlement || null,
    pricing: result.pricing || current.pricing || null,
    output_reference: outputReference,
    completed_at: new Date().toISOString(),
    error: null,
  };
  await patch(p, key, complete);
  return { success: true, pending: false, key, state: complete };
}

async function status() {
  const p = await project();
  const stored = p.metadata?.churchill_v3_vfx?.shots || {};
  const shots = Object.fromEntries(Object.keys(SHOTS).map((key) => [key, stored[key] || { status: "NOT_STARTED" }]));
  return {
    success: true,
    provider: PROVIDER,
    model: MODEL,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    canonical_story_locked: CHURCHILL_NIGHT_CHANGES_STORY.user_story_locked === true,
    shots,
    policy: {
      provider_fallback_changes_story: false,
      story_removal_requires_user_approval: true,
      publication_authorized: false,
    },
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const shot = text(url.searchParams.get("shot"));

    if (action === "catalog") {
      assertCatalog();
      return json({
        success: true,
        canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
        shots: Object.fromEntries(Object.entries(SHOTS).map(([key, value]) => [key, {
          seconds: value.seconds,
          opening_asset_id: value.opening,
          editorial_end_asset_id: value.editorial_end,
        }])),
        policy: {
          story_locked: true,
          provider_fallback_changes_story: false,
          story_removal_requires_user_approval: true,
          publication_authorized: false,
        },
      });
    }
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
    console.error("CHURCHILL_V3_VFX_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
