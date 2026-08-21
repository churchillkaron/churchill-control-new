export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v2-fast-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_CHANGES_90S_V2";
const PROVIDER = "veo";
const MODEL = "fal-ai/veo3.1/fast/first-last-frame-to-video";
const DURATION = 8;

const A = Object.freeze({
  entrance: "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
});

const SHOTS = Object.freeze({
  entrance_to_dinner: Object.freeze({
    opening: A.entrance,
    closing: A.dinner,
    prompt:
      "Animate precisely from the supplied real Churchill entrance frame to the supplied real Churchill dinner frame. Preserve the actual Churchill architecture, plants, wood, brick, warm practical lighting and believable guests. Use one slow controlled forward dolly. A warm glass reflection passes very close to lens and becomes the hidden transition into the real dining world. Premium photoreal hospitality commercial, realistic optics, elegant motion, no portal graphics, no holograms, no invented signage, no fake logo, no generic replacement restaurant. End cleanly and recognizably on the supplied dinner frame.",
  }),
  food_to_pool: Object.freeze({
    opening: A.carpaccio,
    closing: A.pool,
    prompt:
      "Animate precisely from the supplied real Churchill beef carpaccio frame to the supplied real Churchill pool-room frame. Keep the actual dish recognizable and appetizing. Begin as a cinematic macro glide across sauce, parmesan, greens and plate highlights. Steam and one circular polished highlight become the circular highlight of a cue ball, then resolve naturally into the authentic Churchill pool room. Preserve the supplied pool-table geometry and Churchill room identity. Premium photoreal commercial, no fake food, no invented logo, no generic luxury bar, no warped table, no hologram, no cyberpunk. End cleanly on the supplied real pool-room frame.",
  }),
  pool_to_shuffleboard: Object.freeze({
    opening: A.pool,
    closing: A.shuffleboard,
    prompt:
      "Animate precisely from the supplied real Churchill pool-room frame to the supplied real Churchill shuffleboard frame. Preserve the real pool table, room geometry and warm Churchill lighting. A pool ball moves close to lens and creates a clean foreground occlusion. Behind that occlusion, the camera becomes a very low controlled tracking shot along the exact Churchill shuffleboard surface while a puck glides toward the authentic scoring area. Photoreal premium sports-bar cinematography, physically plausible speed, no invented branding, no warped equipment, no generic venue, no sci-fi graphics. End exactly on the supplied shuffleboard frame.",
  }),
  darts_a: Object.freeze({
    opening: A.shuffleboard,
    closing: A.pool,
    prompt:
      "Animate precisely from the supplied real Churchill shuffleboard frame to the supplied real Churchill pool and games-room frame. Track the real shuffleboard puck toward the scoring end with a very low premium camera move. Its final circular motion motivates a controlled acceleration into Churchill's real games area. The supplied final frame is authoritative venue and equipment evidence: preserve whatever real electronic darts machines, illuminated electronic targets, cabinets and score screens are visible there. Never replace them with a traditional, sisal, bristle, cork or vintage dartboard. No generic pub darts wall, no invented architecture, no cyberpunk. End exactly on the supplied real games-room frame.",
  }),
  darts_b: Object.freeze({
    opening: A.pool,
    closing: A.band,
    prompt:
      "Animate precisely from the supplied real Churchill pool and games-room frame to the supplied real Churchill live-band frame. Hold the authentic games-room identity long enough to register. Where electronic darts equipment is visible in the real opening frame, preserve its illuminated electronic target, cabinet and score-screen relationship. A circular practical amber target light blooms naturally into a stage spotlight and carries the camera into the real Churchill music world. Never show a traditional, sisal, bristle, cork or vintage dartboard. Do not invent a singer, band, face, stage, logo or different venue. Premium photoreal concert transition. End exactly on the supplied real band frame.",
  }),
});

const NEGATIVE_PROMPT = [
  "traditional dartboard",
  "sisal dartboard",
  "bristle dartboard",
  "cork dartboard",
  "vintage dartboard",
  "generic pub darts wall",
  "generic restaurant",
  "generic luxury lounge",
  "invented architecture",
  "invented signage",
  "fake logo",
  "readable generated text",
  "face substitution",
  "identity drift",
  "replacement singer",
  "replacement musicians",
  "warped pool table",
  "warped shuffleboard",
  "fake food",
  "hologram",
  "cyberpunk",
  "camera shake",
].join(", ");

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

async function project() {
  const { data: mission, error: missionError } = await supabaseAdmin
    .from("creative_missions")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (missionError) throw missionError;
  if (!mission?.id) throw new Error("CHURCHILL_FAST_PROJECT_NOT_PREPARED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_FAST_PROJECT_NOT_PREPARED");
  return data;
}

function filmState(metadata) {
  return metadata?.churchill_night_changes_v2 || {};
}

function containerFor(key) {
  return key === "darts_a" || key === "darts_b" ? "darts_parts" : "shots";
}

async function patch(p, key, value, status = "GENERATING_TRANSITIONS_FAST_FALLBACK") {
  const metadata = p.metadata || {};
  const current = filmState(metadata);
  const container = containerFor(key);
  const next = {
    ...current,
    status,
    [container]: {
      ...(current[container] || {}),
      [key]: value,
    },
    transition_provider_fallback: {
      active: true,
      provider: PROVIDER,
      model: MODEL,
      mode: "EXACT_FIRST_LAST_FRAME",
      reason: "GOOGLE_VEO_LONG_RUNNING_QUEUE_STALL",
      real_churchill_endpoints_preserved: true,
      publication_authorized: false,
      updated_at: new Date().toISOString(),
    },
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_night_changes_v2: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

function serviceInput(key, p) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_FAST_SHOT_INVALID");
  return {
    model: MODEL,
    description: shot.prompt,
    prompt: shot.prompt,
    generation: {
      model: MODEL,
      provider_parameters: {
        first_frame_asset_id: shot.opening,
        last_frame_asset_id: shot.closing,
        negative_prompt: NEGATIVE_PROMPT,
        duration: "8s",
        aspect_ratio: "16:9",
        resolution: "1080p",
        generate_audio: false,
        auto_fix: false,
        safety_tolerance: "4",
      },
    },
    shot_bible: {
      precision_control: {
        opening_frame_asset_id: shot.opening,
        closing_frame_asset_id: shot.closing,
        exact_last_frame_required: true,
      },
      frame_plan: {
        opening_frame: { asset_id: shot.opening },
        closing_frame: { asset_id: shot.closing },
      },
      output: {
        duration_seconds: DURATION,
        aspect_ratio: "16:9",
        resolution: "1080p",
      },
    },
    output_spec: {
      duration_seconds: DURATION,
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    provider_parameters: {
      first_frame_asset_id: shot.opening,
      last_frame_asset_id: shot.closing,
      negative_prompt: NEGATIVE_PROMPT,
      duration: "8s",
      aspect_ratio: "16:9",
      resolution: "1080p",
      generate_audio: false,
      auto_fix: false,
      safety_tolerance: "4",
    },
    primary_source_asset_id: shot.opening,
    creative_project_id: p.id,
    creative_mission_id: p.creative_mission_id || null,
    quantity: DURATION,
    currency: "THB",
  };
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_FAST_SHOT_INVALID");
  const p = await project();
  const currentFilm = filmState(p.metadata);
  const current = currentFilm[containerFor(key)]?.[key] || null;
  if (
    current?.status === "COMPLETED" &&
    current?.provider === PROVIDER &&
    current?.model === MODEL &&
    current?.output_reference
  ) {
    return { success: true, reused: true, key, state: current };
  }
  if (
    current?.status === "PROCESSING" &&
    current?.provider === PROVIDER &&
    current?.model === MODEL &&
    current?.provider_job_id &&
    current?.usage_id
  ) {
    return { success: true, reused: true, key, state: current };
  }

  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: {
      allowed_providers: [PROVIDER],
      preferred_providers: [PROVIDER],
    },
    input: serviceInput(key, p),
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_FAST_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: key,
      fallback_from_provider: "google-veo",
      request_mode: "EXACT_FIRST_LAST_FRAME",
      opening_asset_id: shot.opening,
      closing_asset_id: shot.closing,
      electronic_darts_midpoint: key === "darts_a" || key === "darts_b",
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    },
    category: "AI",
  });

  const state = {
    status: result?.pending ? "PROCESSING" : "COMPLETED",
    provider: result?.provider || PROVIDER,
    model: result?.model || MODEL,
    provider_job_id: result?.provider_job_id || null,
    provider_status: result?.provider_status || null,
    usage_id: result?.usage?.id || null,
    credential_id: result?.credential_id || null,
    pricing: result?.pricing || null,
    queue: result?.output?.queue || result?.queue || null,
    started_at: result?.started_at || new Date().toISOString(),
    opening_asset_id: shot.opening,
    closing_asset_id: shot.closing,
    duration_seconds: DURATION,
    output_reference: result?.pending
      ? null
      : (result?.output?.video_url || result?.output?.file_url || result?.output?.url || null),
    request_mode: "EXACT_FIRST_LAST_FRAME",
    fallback_from_provider: "google-veo",
    electronic_darts_midpoint: key === "darts_a" || key === "darts_b",
    traditional_dartboard_forbidden: true,
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  if (!SHOTS[key]) throw new Error("CHURCHILL_FAST_SHOT_INVALID");
  const p = await project();
  const current = filmState(p.metadata)[containerFor(key)]?.[key] || null;
  if (!current || current.provider !== PROVIDER || current.model !== MODEL) {
    throw new Error("CHURCHILL_FAST_SHOT_NOT_STARTED");
  }
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, key, state: current };
  }
  if (!current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_FAST_PENDING_STATE_INCOMPLETE");
  }

  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: current.provider,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: {
      model: current.model,
      ...(current.queue || {}),
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_FAST_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: key,
      fallback_from_provider: "google-veo",
      request_mode: "EXACT_FIRST_LAST_FRAME",
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Fast Veo generation failed",
      completed_at: new Date().toISOString(),
    };
    await patch(p, key, failed, "FAST_TRANSITION_REPAIR_REQUIRED");
    return { success: false, pending: false, failed: true, key, state: failed };
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
    result?.output?.video_url ||
    result?.output?.file_url ||
    result?.output?.url ||
    result?.output?.result ||
    result?.output?.raw?.video?.url ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_FAST_COMPLETED_OUTPUT_REQUIRED");

  const completed = {
    ...current,
    status: "COMPLETED",
    provider_status: result.provider_status || "completed",
    output_reference: outputReference,
    settlement: result.settlement || null,
    pricing: result.pricing || current.pricing || null,
    queue: result.queue || current.queue || null,
    completed_at: new Date().toISOString(),
    error: null,
  };
  await patch(p, key, completed);
  return { success: true, pending: false, key, state: completed };
}

async function status() {
  const p = await project();
  const film = filmState(p.metadata);
  return {
    success: true,
    creative_project_id: p.id,
    provider: PROVIDER,
    model: MODEL,
    shots: Object.fromEntries(
      Object.keys(SHOTS).map((key) => [
        key,
        film[containerFor(key)]?.[key] || { status: "NOT_STARTED" },
      ]),
    ),
    transition_provider_fallback: film.transition_provider_fallback || null,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const key = text(url.searchParams.get("shot"));
    if (action === "status") return json(await status());
    if (action === "start") return json(await start(key));
    if (action === "poll") return json(await poll(key));
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_FAST_TRANSITION_FAILED", {
      message: error?.message || String(error),
    });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
