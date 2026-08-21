export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v2-darts-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_CHANGES_90S_V2";
const SHOT_KEY = "shuffleboard_to_stage";
const PROVIDER = "google-veo";
const MODEL = "veo-3.1-generate-preview";
const DURATION = 8;

const SHUFFLEBOARD = "23756544-16cd-4d76-9e26-2e11bdde8c23";
const POOL_ROOM_WITH_GAMES = "797c9d16-5465-4e60-be93-a6c65707f7db";
const SINGER = "370a3030-8656-4b28-934f-6653d5eaf3c8";
const BAND = "cb027610-625c-4751-99a0-6a41b3597237";
const LOGO = "f2e57100-1b78-43c9-b080-1c7945fc4d23";

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
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
  if (!mission?.id) throw new Error("CHURCHILL_DARTS_PROJECT_NOT_PREPARED");

  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_DARTS_PROJECT_NOT_PREPARED");
  return data;
}

async function patchShot(p, shotState, filmStatus) {
  const metadata = p.metadata || {};
  const current = metadata.churchill_night_changes_v2 || {};
  const next = {
    ...current,
    status: filmStatus || current.status || "GENERATING_TRANSITIONS",
    shots: {
      ...(current.shots || {}),
      [SHOT_KEY]: shotState,
    },
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, churchill_night_changes_v2: next }, updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

function contract(p) {
  return {
    title: "Churchill — Shuffleboard to Real Electric Darts to Live Stage",
    intent: {
      story_purpose: "The last game beat becomes Churchill's live music reveal.",
      visual_meaning:
        "Start on the exact Churchill shuffleboard. Track the puck into the scoring end. Use the supplied real Churchill pool/games-room reference as authoritative venue evidence for the electric-darts moment: preserve the visible electronic target-machine language, illuminated circular target, cabinet/screen relationship and Churchill room character. The dart impact becomes a stage spotlight and resolves exactly into the supplied real band frame.",
      emotional_tone: "competition, impact, anticipation, live-energy release",
      editorial_transition: "Finish exactly on the supplied real band frame so the next shot is authentic stage footage.",
    },
    requirements: {
      visual_quality: "world-class photoreal global hospitality and live-entertainment commercial",
      authenticity:
        "Churchill remains Churchill. Do not rebuild it as another lounge. The supplied pool/games-room image is venue/equipment evidence, not style inspiration.",
      electric_darts:
        "Only electronic darts. Preserve the electronic machine/target/screen visual language proven by the Churchill venue reference. A traditional cork, bristle, sisal or pub dartboard is forbidden. No vintage dartboard. No standalone generic board on a wall.",
      singer:
        "The supplied singer image is identity evidence. Do not create a new hero close-up or reinterpret her face, hair, tattoos, skin tone, body shape or age.",
      band: "End on the supplied real band image. Do not replace or redesign musicians.",
      logo: "Do not generate readable Churchill logo text in this transition; exact logo is composited later from the real logo source.",
      camera:
        "Very low controlled glide with the puck, brief physically plausible acceleration toward the electronic darts target, 0.3 second impact emphasis, then circular light expands into the stage spotlight.",
      negative_constraints: [
        "traditional dartboard",
        "sisal dartboard",
        "bristle dartboard",
        "vintage dartboard",
        "generic pub darts wall",
        "generic luxury lounge",
        "invented Churchill architecture",
        "invented logo",
        "readable generated text",
        "identity drift",
        "lookalike singer",
        "replacement musicians",
        "cyberpunk",
        "hologram",
        "neon sci-fi redesign",
        "rubbery faces",
        "warped shuffleboard",
        "camera shake",
      ],
    },
    shot_bible: {
      source: {
        reference_asset_ids: [POOL_ROOM_WITH_GAMES, SINGER, LOGO],
      },
      precision_control: {
        opening_frame_asset_id: SHUFFLEBOARD,
        closing_frame_asset_id: BAND,
        exact_last_frame_required: true,
        reference_asset_ids: [POOL_ROOM_WITH_GAMES, SINGER, LOGO],
        multi_reference_control_required: true,
      },
      frame_plan: {
        opening_frame: { asset_id: SHUFFLEBOARD },
        closing_frame: { asset_id: BAND },
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
      first_frame_asset_id: SHUFFLEBOARD,
      last_frame_asset_id: BAND,
      reference_asset_ids: [POOL_ROOM_WITH_GAMES, SINGER, LOGO],
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    primary_source_asset_id: SHUFFLEBOARD,
    creative_project_id: p.id,
    creative_mission_id: p.creative_mission_id || null,
    quantity: DURATION,
    currency: "THB",
  };
}

async function start() {
  const p = await project();
  const current = p.metadata?.churchill_night_changes_v2?.shots?.[SHOT_KEY] || null;
  if (current?.status === "COMPLETED" && current?.darts_reference_lock === true && current?.output_reference) {
    return { success: true, reused: true, state: current };
  }
  if (current?.status === "PROCESSING" && current?.darts_reference_lock === true && current?.provider_job_id && current?.usage_id) {
    return { success: true, reused: true, state: current };
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
    input: contract(p),
    metadata: {
      module: "CREATIVE",
      operation: "CHURCHILL_NIGHT_CHANGES_SHUFFLEBOARD_REAL_ELECTRIC_DARTS_STAGE_V2",
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: SHOT_KEY,
      darts_reference_asset_id: POOL_ROOM_WITH_GAMES,
      darts_reference_lock: true,
      electronic_darts_only: true,
      traditional_dartboard_forbidden: true,
      singer_identity_asset_id: SINGER,
      exact_logo_asset_id: LOGO,
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
    started_at: result?.started_at || new Date().toISOString(),
    opening_asset_id: SHUFFLEBOARD,
    closing_asset_id: BAND,
    reference_asset_ids: [POOL_ROOM_WITH_GAMES, SINGER, LOGO],
    darts_reference_asset_id: POOL_ROOM_WITH_GAMES,
    darts_reference_lock: true,
    electronic_darts_only: true,
    traditional_dartboard_forbidden: true,
    duration_seconds: DURATION,
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || null),
    publication_authorized: false,
  };
  await patchShot(p, state, "GENERATING_TRANSITIONS");
  return { success: true, reused: false, state };
}

async function poll() {
  const p = await project();
  const current = p.metadata?.churchill_night_changes_v2?.shots?.[SHOT_KEY] || null;
  if (!current?.darts_reference_lock) throw new Error("CHURCHILL_DARTS_LOCKED_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, state: current };
  }
  if (!current.provider || !current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_DARTS_PENDING_STATE_INCOMPLETE");
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
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
    },
    metadata: {
      module: "CREATIVE",
      operation: "CHURCHILL_NIGHT_CHANGES_SHUFFLEBOARD_REAL_ELECTRIC_DARTS_STAGE_V2_POLL",
      command_identity: COMMAND_IDENTITY,
      creative_project_id: p.id,
      shot_key: SHOT_KEY,
      darts_reference_asset_id: POOL_ROOM_WITH_GAMES,
      darts_reference_lock: true,
      electronic_darts_only: true,
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const state = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Electric darts transition failed",
      completed_at: new Date().toISOString(),
    };
    await patchShot(p, state, "TRANSITION_REPAIR_REQUIRED");
    return { success: false, pending: false, failed: true, state };
  }
  if (result?.pending) {
    const state = {
      ...current,
      status: "PROCESSING",
      provider_status: result.provider_status || "processing",
      last_polled_at: new Date().toISOString(),
    };
    await patchShot(p, state, "GENERATING_TRANSITIONS");
    return { success: true, pending: true, state };
  }

  const outputReference =
    result?.output?.url ||
    result?.output?.file_url ||
    result?.output?.video_url ||
    result?.output?.raw?.output?.storage_reference ||
    result?.output?.raw?.output?.file_url ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_DARTS_COMPLETED_OUTPUT_REQUIRED");

  const state = {
    ...current,
    status: "COMPLETED",
    provider_status: result.provider_status || "completed",
    settlement: result.settlement || null,
    pricing: result.pricing || current.pricing || null,
    output_reference: outputReference,
    completed_at: new Date().toISOString(),
    error: null,
    darts_reference_lock: true,
    electronic_darts_only: true,
    traditional_dartboard_forbidden: true,
  };
  await patchShot(p, state, "GENERATING_TRANSITIONS");
  return { success: true, pending: false, state };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "start") return json(await start());
    if (action === "poll") return json(await poll());
    const p = await project();
    return json({
      success: true,
      shot_key: SHOT_KEY,
      state: p.metadata?.churchill_night_changes_v2?.shots?.[SHOT_KEY] || { status: "NOT_STARTED" },
      darts_reference_asset_id: POOL_ROOM_WITH_GAMES,
      darts_reference_lock: true,
      electronic_darts_only: true,
      traditional_dartboard_forbidden: true,
      publication_authorized: false,
    });
  } catch (error) {
    console.error("CREATIVE_CHURCHILL_NIGHT_CHANGES_DARTS_V2_FAILED", {
      message: error?.message || String(error),
    });
    return json({ success: false, error: error?.message || String(error) }, 500);
  }
}
