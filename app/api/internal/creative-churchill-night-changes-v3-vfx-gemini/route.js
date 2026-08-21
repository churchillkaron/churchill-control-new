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
const TOKEN = "churchill-night-changes-v3-vfx-gemini-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";

const A = Object.freeze({
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
});

const COMMON =
  "Photoreal world-class hospitality film. Preserve authentic Churchill identity and materials. Do not redesign the venue, logo, people, pool, shuffleboard or food. No hologram UI, cyberpunk, generic luxury lounge, fake signage, invented logo, traditional/sisal/bristle/cork/vintage dartboard, rubbery faces, warped furniture or cartoon physics. Impossible effects must look physically photographed.";

const SHOTS = Object.freeze({
  wine_universe: Object.freeze({
    seconds: 7,
    source: A.dinner,
    prompt: `${COMMON} Start from the supplied authentic Churchill dinner image. Move into extreme macro of a real wine glass and red wine. Time slows. Several suspended red-wine droplets hang in warm practical light. Inside the droplets are tiny realistic reflected glimpses of the same Churchill night: dinner, pool, shuffleboard, modern electronic darts with score-screen light language, and live stage. One droplet may show a distant singer silhouette/reflection only; do not invent a face. Camera chooses one droplet and passes through its liquid surface, resolving toward authentic dinner again. Warm amber brand energy appears only as natural glass/liquid refraction. Make this an iconic screenshot-worthy luxury commercial moment, not fantasy graphics.`,
  }),
  steam_into_bar: Object.freeze({
    seconds: 4,
    source: A.carpaccio,
    prompt: `${COMMON} Start on the supplied real Churchill food. Macro glide across the actual dish, sauce and steam. Steam grows naturally until it fills the lens, then becomes warm bar atmosphere/mist. It must feel like one continuous practical camera event. Do not invent another dish or restaurant. End in a warm mist foreground prepared for an editorial cut into authentic Churchill bar/dinner footage.`,
  }),
  ice_time_freeze: Object.freeze({
    seconds: 8,
    source: A.dinner,
    prompt: `${COMMON} Signature VFX. In warm authentic Churchill bar/dinner atmosphere, realistic cocktail ice and amber liquid trigger freeze-time. Ice cubes, liquid and droplets suspend in mid-air while only the camera moves. Travel between droplets and through one crystal-clear ice cube in extreme macro with condensation and physically correct optics. Inside the ice cube, show the authentic Churchill pool-room visual language as realistic refraction. Rotate through the ice so the cube becomes a white cue ball and motion resumes. Keep people background and stable. This is expensive frozen-time cinematography, not sci-fi.`,
  }),
  pool_to_shuffleboard: Object.freeze({
    seconds: 5,
    source: A.pool,
    prompt: `${COMMON} Start from the supplied authentic Churchill pool room. A real pool ball rolls extremely close to camera and fully occludes lens. Through that foreground wipe, continue as a camera only a few centimeters above the real Churchill shuffleboard; pool ball becomes shuffleboard puck through the occlusion. Preserve warm wood, scoring geometry and realistic proportions. End stable and low, ready to match-cut to the exact authentic shuffleboard source.`,
  }),
  shuffleboard_to_dart: Object.freeze({
    seconds: 4,
    source: A.shuffleboard,
    prompt: `${COMMON} Start from the supplied authentic Churchill shuffleboard. Track the puck toward the scoring end. As the puck reaches the edge and falls, use a tight physically plausible match transformation: the falling puck becomes a modern dart in motion. A natural human hand catches it cleanly. Do not show any dartboard yet. No cartoon morphing.`,
  }),
  electric_dart_flight: Object.freeze({
    seconds: 7,
    source: A.pool,
    prompt: `${COMMON} High-energy action shot. Viewer travels with a modern dart through authentic warm Churchill spatial language, passing dining, pool, shuffleboard and stage-preparation cues. Electronic darts only. Final target must read as modern illuminated electronic-darts equipment with circular target light and digital score-screen context. Traditional, sisal, bristle, cork and vintage dartboards are absolutely forbidden. At electronic bullseye impact, create a split-second visual stop, then let the circular electronic target light expand naturally into a practical stage spotlight/lens fill. Do not generate a singer close-up; prepare an editorial cut to the real band.`,
  }),
  frozen_night_hero: Object.freeze({
    seconds: 7,
    source: A.dinner,
    prompt: `${COMMON} Biggest hero shot. The Churchill night is frozen in one impossible continuous camera move. Pass through suspended red wine, cocktail liquid and ice, real food/cutlery action, a pool ball in motion, a shuffleboard puck moving, a modern electronic dart travelling, stage/performance energy and guests frozen mid-laugh/dance. Protect people from identity distortion by keeping faces natural, stable and mostly medium/background. One small red-wine droplet remains moving while everything else is frozen; inside it is a tiny moving Churchill reality. Camera approaches and enters that droplet to prepare the loop back to dinner. Premium photoreal time-freeze physics, coherent optics, no sci-fi graphics.`,
  }),
});

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
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
  if (missing.length) throw new Error(`CHURCHILL_V3_GEMINI_VFX_CATALOG_MISSING:${missing.join(",")}`);
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
    .update({ metadata: { ...metadata, churchill_v3_vfx: next }, updated_at: new Date().toISOString() })
    .eq("id", p.id)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return next;
}

async function start(key) {
  const shot = SHOTS[key];
  if (!shot) throw new Error("CHURCHILL_V3_GEMINI_VFX_SHOT_INVALID");
  const p = await project();
  const current = p.metadata?.churchill_v3_vfx?.shots?.[key] || null;
  if (current?.status === "COMPLETED" && current?.output_reference) {
    return { success: true, reused: true, key, state: current };
  }
  if (current?.status === "PROCESSING" && current?.provider === PROVIDER && current?.provider_job_id && current?.usage_id) {
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
      generation: { model: MODEL, output_spec: { duration_seconds: shot.seconds, aspect_ratio: "16:9" } },
      provider_parameters: { aspect_ratio: "16:9", primary_source_asset_id: shot.source },
      creative_project_id: p.id,
      creative_mission_id: p.creative_mission_id || null,
      credential_id: credentialId,
      quantity: shot.seconds,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_V3_GEMINI_${key.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      shot_key: key,
      opening_asset_id: shot.source,
      provider_fallback_from: "runway",
      provider_fallback_reason: "RUNWAY_CREDENTIAL_UNAVAILABLE",
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
    credential_id: result?.credential_id || credentialId,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    duration_seconds: shot.seconds,
    opening_asset_id: shot.source,
    output_reference: result?.pending
      ? null
      : (result?.output?.file_url || result?.output?.video_url || result?.output?.url || null),
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    provider_fallback_changes_story: false,
    story_change_authorized: false,
    publication_authorized: false,
  };
  await patch(p, key, state);
  return { success: true, reused: false, key, state };
}

async function poll(key) {
  if (!SHOTS[key]) throw new Error("CHURCHILL_V3_GEMINI_VFX_SHOT_INVALID");
  const p = await project();
  const current = p.metadata?.churchill_v3_vfx?.shots?.[key] || null;
  if (!current) throw new Error("CHURCHILL_V3_GEMINI_VFX_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, key, state: current };
  }
  if (current.provider !== PROVIDER || !current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_V3_GEMINI_VFX_PENDING_STATE_INCOMPLETE");
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
      operation: `CHURCHILL_V3_GEMINI_${key.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      creative_project_id: p.id,
      shot_key: key,
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
      error: result.error || "Gemini generation failed",
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
  if (!outputReference) throw new Error("CHURCHILL_V3_GEMINI_VFX_COMPLETED_OUTPUT_REQUIRED");

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
  return {
    success: true,
    provider: PROVIDER,
    model: MODEL,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    shots: Object.fromEntries(Object.keys(SHOTS).map((key) => [key, stored[key] || { status: "NOT_STARTED" }])),
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
    console.error("CHURCHILL_V3_GEMINI_VFX_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
