export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v2-runway-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_CHANGES_90S_V2";
const PROVIDER = "runway";
const MODEL = "gen4.5";
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
      "SHOT PURPOSE: Carry the viewer from the real Churchill entrance into dinner without feeling like a normal cut. ENVIRONMENT: Preserve the supplied real Churchill entrance architecture, plants, red-carpet approach, warm wood and practical lighting. EXACT ACTION: one slow controlled forward dolly; a realistic warm glass reflection grows across lens and becomes the visual wipe. Finish the motion calm and centered so the editor can land on the supplied authentic Churchill dinner still as the exact next frame. Do not invent signage, logos, architecture or a different restaurant. No holograms, portals, cyberpunk, neon redesign, camera shake or fake text. Premium photoreal hospitality commercial cinematography.",
  }),
  food_to_pool: Object.freeze({
    opening: A.carpaccio,
    closing: A.pool,
    prompt:
      "SHOT PURPOSE: Make a real Churchill food macro become the beginning of the games world. ENVIRONMENT: Keep the supplied Churchill carpaccio recognisable and appetising. EXACT ACTION: cinematic macro glide over sauce, parmesan, greens and plate highlights; a circular polished highlight and gentle steam become cue-ball visual language. End with a clean circular foreground occlusion and stable warm lighting so the editor can cut to the supplied authentic Churchill pool-room still as the exact next frame. No fake dish, no warped food, no invented logo, no generic luxury lounge, no cyberpunk or hologram. Premium photoreal commercial optics.",
  }),
  pool_to_shuffleboard: Object.freeze({
    opening: A.pool,
    closing: A.shuffleboard,
    prompt:
      "SHOT PURPOSE: Connect Churchill pool to shuffleboard as one physical movement. ENVIRONMENT: Preserve the supplied real Churchill pool room, table geometry, warm amber light and authentic venue identity. EXACT ACTION: a real pool ball rolls very close to lens and creates a full foreground occlusion; continue as a very low, controlled tracking move whose speed and perspective are prepared for a match cut to the supplied authentic Churchill shuffleboard still. No warped table, no invented branding, no generic venue, no fake text, no sci-fi graphics. Premium photoreal sports-bar cinematography.",
  }),
  darts_a: Object.freeze({
    opening: A.shuffleboard,
    closing: A.pool,
    prompt:
      "SHOT PURPOSE: Move from Churchill shuffleboard into the authentic Churchill games room and electronic-darts world. ENVIRONMENT: Preserve the real shuffleboard surface and Churchill lighting. EXACT ACTION: track the puck toward the scoring end, then use its circular motion for a controlled acceleration into a circular amber-light composition. End on a stable composition designed for an editorial cut to the supplied authentic Churchill games-room still, which is the authoritative electric-darts frame. NEGATIVE: never show a traditional, sisal, bristle, cork or vintage dartboard; no generic pub darts wall; no invented architecture, logo, text or cyberpunk redesign. Premium photoreal camera movement.",
  }),
  darts_b: Object.freeze({
    opening: A.pool,
    closing: A.band,
    prompt:
      "SHOT PURPOSE: Turn the authentic Churchill games-room energy into live music without generating a replacement singer or band. ENVIRONMENT: Preserve the supplied real Churchill games-room identity and its warm practical lighting. EXACT ACTION: hold the venue long enough to register, then let one circular practical amber light bloom naturally into a stage-spotlight-shaped lens flare. End with the light filling the frame so the editor can cut directly to the supplied real Churchill band frame. NEGATIVE: no traditional/sisal/bristle/cork/vintage dartboard, no invented singer, no invented musicians, no face generation, no fake logo, no different venue, no hologram or cyberpunk. Premium photoreal concert transition.",
  }),
});

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
  if (!mission?.id) throw new Error("CHURCHILL_RUNWAY_PROJECT_NOT_PREPARED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_RUNWAY_PROJECT_NOT_PREPARED");
  return data;
}

function filmState(metadata) {
  return metadata?.churchill_night_changes_v2 || {};
}

async function patch(p, key, value, status = "GENERATING_TRANSITIONS_RUNWAY_FALLBACK") {
  const metadata = p.metadata || {};
  const current = filmState(metadata);
  const next = {
    ...current,
    status,
    runway_shots: {
      ...(current.runway_shots || {}),
      [key]: value,
    },
    transition_provider_fallback: {
      active: true,
      provider: PROVIDER,
      model: MODEL,
      mode: "AUTHENTIC_OPENING_FRAME_PLUS_EDITORIAL_EXACT_CLOSING_FRAME",
      reason: "GOOGLE_VEO_QUEUE_STALL_AND_FAL_SUPPLIER_BALANCE_EXHAUSTED",
      exact_closing_frame_enforced_in_assembler: true,
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
  if (!shot) throw new Error("CHURCHILL_RUNWAY_SHOT_INVALID");
  return {
    model: MODEL,
    source: shot.opening,
    selected_assets: [shot.opening],
    prompt: shot.prompt,
    description: shot.prompt,
    duration_seconds: DURATION,
    aspect_ratio: "16:9",
    resolution: "720p",
    generation: {
      model: MODEL,
      provider_parameters: {
        duration: DURATION,
        aspect_ratio: "16:9",
      },
    },
    output_spec: {
      duration_seconds: DURATION,
      aspect_ratio: "16:9",
      resolution: "720p",
    },
    provider_parameters: {
      duration: DURATION,
      aspect_ratio: "16:9",
    },
    creative_project_id: p.id,
    creative_mission_id: p.creative_mission_id || null,
    quantity: DURATION,
    currency: "THB",
  };
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_RUNWAY_SHOT_INVALID");
  const p = await project();
  const current = filmState(p.metadata).runway_shots?.[key] || null;
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
    provider_policy: {
      allowed_providers: [PROVIDER],
      preferred_providers: [PROVIDER],
    },
    input: serviceInput(key, p),
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_RUNWAY_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: key,
      fallback_from_provider: "google-veo",
      fallback_reason: "GOOGLE_QUEUE_STALL_FAL_BALANCE_EXHAUSTED",
      opening_asset_id: shot.opening,
      closing_asset_id: shot.closing,
      exact_closing_frame_enforced_in_assembler: true,
      electronic_darts_midpoint: key === "darts_a" || key === "darts_b",
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    },
    category: "AI",
  });

  const outputReference =
    result?.output?.video_url ||
    result?.output?.file_url ||
    result?.output?.url ||
    result?.output?.result ||
    null;
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
    opening_asset_id: shot.opening,
    exact_closing_asset_id: shot.closing,
    exact_closing_frame_enforced_in_assembler: true,
    duration_seconds: DURATION,
    output_reference: result?.pending ? null : outputReference,
    fallback_from_provider: "google-veo",
    electronic_darts_midpoint: key === "darts_a" || key === "darts_b",
    traditional_dartboard_forbidden: true,
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  if (!SHOTS[key]) throw new Error("CHURCHILL_RUNWAY_SHOT_INVALID");
  const p = await project();
  const current = filmState(p.metadata).runway_shots?.[key] || null;
  if (!current) throw new Error("CHURCHILL_RUNWAY_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, key, state: current };
  }
  if (!current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_RUNWAY_PENDING_STATE_INCOMPLETE");
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
      ...(current.queue || {}),
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_RUNWAY_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: key,
      exact_closing_frame_enforced_in_assembler: true,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Runway generation failed",
      completed_at: new Date().toISOString(),
    };
    await patch(p, key, failed, "RUNWAY_TRANSITION_REPAIR_REQUIRED");
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
    result?.output?.url ||
    result?.output?.video_url ||
    result?.output?.file_url ||
    result?.output?.result ||
    (Array.isArray(result?.output) ? result.output[0] : null) ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_RUNWAY_COMPLETED_OUTPUT_REQUIRED");

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
  const film = filmState(p.metadata);
  const shots = Object.fromEntries(
    Object.keys(SHOTS).map((key) => [key, film.runway_shots?.[key] || { status: "NOT_STARTED" }]),
  );
  return {
    success: true,
    creative_project_id: p.id,
    provider: PROVIDER,
    model: MODEL,
    shots,
    editorial_contract: {
      generated_motion_uses_authentic_opening_frame: true,
      exact_closing_frame_enforced_in_assembler: true,
      darts_a_exact_closing_asset_id: A.pool,
      darts_b_exact_closing_asset_id: A.band,
      generated_singer_or_band_replacement_forbidden: true,
      traditional_dartboard_forbidden: true,
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
    console.error("CHURCHILL_RUNWAY_FALLBACK_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({
      success: false,
      error: error?.message || String(error),
      details: error?.details || null,
    }, 500);
  }
}
