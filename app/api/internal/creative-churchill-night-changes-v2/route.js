export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  executeService,
  settlePendingService,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v2-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_CHANGES_90S_V2";
const FILM_CONTRACT = "CHURCHILL_AUTHENTIC_CINEMATIC_FILM_V2";
const MOTION_PROVIDER = "google-veo";
const MOTION_MODEL = "veo-3.1-generate-preview";
const MOTION_SECONDS = 8;
const MASTER_SECONDS = 90;

const SOURCE = Object.freeze({
  logo_exact: "f2e57100-1b78-43c9-b080-1c7945fc4d23",
  logo_motion_existing: "861dd782-483d-4f1d-b785-0be1d6773bec",
  entrance_still: "f0c96f1a-6719-4dc2-8b9a-d095864d273a",
  entrance_video: "d4dbb4f5-c2b8-41f9-87db-6cbc2f9a4a65",
  entrance_video_alt: "aadd1364-4d13-4734-b2f6-d552e85ed8b5",
  dining_video: "fb7e06e3-77cb-49f3-9f11-9fa59887b6be",
  dinner_social: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  food_striploin: "9a7f96b4-1c77-47f5-8377-69f0404929ee",
  food_carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  food_salmon: "7df53ffb-b0dd-4a25-bc68-8e4225fe782f",
  food_nachos: "c9aafc12-9f77-4305-8bb6-52e2b1db2eb4",
  food_salad: "707932d6-467d-4f07-a938-829515abf124",
  pool_video: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  pool_still: "797c9d16-5465-4e60-be93-a6c65707f7db",
  pool_staff: "5355b657-b73d-4dad-b53c-9a5d00b30748",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  singer_identity: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
  stage_video: "dcd86649-42f8-4f7a-be91-00c456eb940d",
  score: "4de3ecea-6c1a-4d28-a48d-ae8d246237f5",
});

const AUTHENTICITY = Object.freeze({
  contract: "CREATIVE_AUTHENTIC_VENUE_FILM_V2",
  venue: "Churchill Bar & Restaurant, Karon, Phuket",
  exact_duration_seconds: MASTER_SECONDS,
  source_of_truth: "ORGANIZATION_UPLOADS_AND_APPROVED_CHURCHILL_ASSETS",
  rules: Object.freeze({
    exact_churchill_3d_logo_required: true,
    singer_identity_must_match_reference: true,
    real_band_required: true,
    real_venue_geometry_required: true,
    real_food_identity_required: true,
    real_pool_required: true,
    real_shuffleboard_required: true,
    electric_darts_only: true,
    traditional_dartboard_forbidden: true,
    generated_singer_closeup_forbidden: true,
    generated_band_replacement_forbidden: true,
    generated_logo_text_forbidden: true,
    generated_venue_replacement_forbidden: true,
    generic_luxury_bar_replacement_forbidden: true,
    synthetic_neon_redesign_forbidden: true,
    publication_authorized: false,
  }),
  effect_policy:
    "The premium/future effect comes from impossible camera movement, reflections, time fracture, object match-cuts, freeze-time and sound design. Churchill itself remains authentic.",
});

const COMMON_NEGATIVES = Object.freeze([
  "generic restaurant replacement",
  "generic luxury lounge replacement",
  "invented architecture",
  "invented signage",
  "invented Churchill logo",
  "misspelled text",
  "face substitution",
  "identity drift",
  "traditional dartboard",
  "sisal dartboard",
  "generic darts pub",
  "hologram user interface",
  "cyberpunk redesign",
  "heavy neon redesign",
  "cartoon physics",
  "rubbery faces",
  "extra fingers",
  "warped pool table",
  "warped shuffleboard",
  "fake food",
  "camera shake",
  "fast unreadable whip pan",
]);

const SHOTS = Object.freeze({
  entrance_to_dinner: Object.freeze({
    title: "Entrance Into The Night",
    editorial_role: "move from the exact Churchill entrance into the real dining world as one impossible camera move",
    opening_asset_id: SOURCE.entrance_still,
    closing_asset_id: SOURCE.dinner_social,
    reference_asset_ids: [SOURCE.logo_exact, SOURCE.food_carpaccio],
    intent: Object.freeze({
      story_purpose: "The viewer enters Churchill and realizes the night behaves differently inside.",
      visual_meaning: "The real entrance remains recognizable while a warm reflection becomes a portal into the real Churchill dining atmosphere.",
      emotional_tone: "anticipation, premium warmth, discovery",
      editorial_transition: "End precisely on the supplied real dinner frame for a seamless cut into authentic dining footage.",
    }),
    requirements: Object.freeze({
      visual_quality: "world-class photoreal hospitality commercial cinematography",
      environment: "Preserve the supplied Churchill entrance and dining identity; do not redesign either location.",
      camera: "slow controlled forward dolly; one elegant reflection pass; no frantic movement",
      people: "Guests remain natural background atmosphere; no hero face invention.",
      transition_mechanic: "practical warm-light reflection expands across lens and resolves into the dining room; no portal graphics or holograms",
    }),
  }),
  food_to_pool: Object.freeze({
    title: "Dinner Becomes Play",
    editorial_role: "transform a real Churchill food macro into the real Churchill pool room without a conventional cut",
    opening_asset_id: SOURCE.food_carpaccio,
    closing_asset_id: SOURCE.pool_still,
    reference_asset_ids: [SOURCE.food_striploin, SOURCE.logo_exact],
    intent: Object.freeze({
      story_purpose: "Dinner is not a separate feature section; it physically becomes the next part of the Churchill night.",
      visual_meaning: "Macro food texture, steam and polished sauce reflections evolve into the circular geometry of a cue ball and then the actual pool environment.",
      emotional_tone: "appetite turning into playful energy",
      editorial_transition: "Land exactly on the supplied real pool-room frame.",
    }),
    requirements: Object.freeze({
      visual_quality: "macro food cinematography transitioning into premium realistic billiards cinematography",
      food: "Keep the supplied Churchill dish recognizable and appetizing; never invent a different dish.",
      pool: "The final pool room and table must match the supplied Churchill source.",
      camera: "macro glide, controlled rack focus, circular match-cut into cue-ball geometry",
      transition_mechanic: "steam/reflection/circular highlight becomes cue-ball highlight; never morph people or text",
    }),
  }),
  pool_to_shuffleboard: Object.freeze({
    title: "The Game Continues",
    editorial_role: "make the real Churchill pool ball become the real Churchill shuffleboard puck in one low moving shot",
    opening_asset_id: SOURCE.pool_still,
    closing_asset_id: SOURCE.shuffleboard,
    reference_asset_ids: [SOURCE.pool_staff, SOURCE.logo_exact],
    intent: Object.freeze({
      story_purpose: "The games feel physically connected rather than presented as a feature montage.",
      visual_meaning: "A pool ball crosses close to lens; the occlusion becomes a low tracking view over the authentic shuffleboard and resolves to the real table.",
      emotional_tone: "precision, competition, fun",
      editorial_transition: "Finish on the supplied authentic shuffleboard geometry and scoring area.",
    }),
    requirements: Object.freeze({
      visual_quality: "photoreal premium sports-bar macro cinematography",
      pool: "Preserve Churchill pool-table geometry and branding; do not invent table logos.",
      shuffleboard: "Preserve the exact supplied table proportions, wood and scoring layout.",
      camera: "very low controlled tracking movement, shallow depth of field, physically plausible speed",
      transition_mechanic: "foreground ball occlusion match-cuts to puck; no liquid morph and no fantasy equipment",
    }),
  }),
  shuffleboard_to_stage: Object.freeze({
    title: "Impact Becomes Music",
    editorial_role: "connect the games section to the live band while respecting the real singer and real band as protected identity evidence",
    opening_asset_id: SOURCE.shuffleboard,
    closing_asset_id: SOURCE.band,
    reference_asset_ids: [SOURCE.singer_identity, SOURCE.logo_exact],
    intent: Object.freeze({
      story_purpose: "A final game impact becomes the musical activation of Churchill.",
      visual_meaning: "The puck reaches its scoring zone, a circular amber reflection becomes the visual language of Churchill electronic darts, then that circular light expands into the stage spotlight and lands on the supplied real band frame.",
      emotional_tone: "release, anticipation, live energy",
      editorial_transition: "The final frame is the supplied real band image so the next edit can immediately switch to real stage footage with no generated singer close-up.",
    }),
    requirements: Object.freeze({
      visual_quality: "world-class photoreal concert-transition cinematography",
      darts: "Use only electronic-darts visual language with illuminated circular target and score-screen context; traditional/sisal dartboards are absolutely forbidden. Do not fabricate a detailed darts room if it is not visible in the supplied authentic references.",
      singer: "The supplied singer reference is identity evidence only. Do not create a new close-up of her face. Do not reinterpret her face, tattoos, body proportions or hair.",
      band: "End on the supplied real band source. Do not replace musicians.",
      camera: "controlled acceleration into one circular amber highlight, short impact beat, then elegant spotlight expansion",
      transition_mechanic: "puck impact -> circular electronic-darts light language -> stage spotlight; no sci-fi UI",
    }),
  }),
});

const EDIT_PLAN = Object.freeze([
  { key: "logo_open", seconds: 6, source: "AUTHENTIC_LOGO", effect: "3D logo reveal extended from existing motion, exact master logo resolves cleanly" },
  { key: "entrance_real", seconds: 4, source: "REAL_VIDEO", asset_id: SOURCE.entrance_video },
  { key: "entrance_to_dinner", seconds: 8, source: "GENERATED_TRANSITION", shot: "entrance_to_dinner" },
  { key: "dining_real", seconds: 7, source: "REAL_VIDEO", asset_id: SOURCE.dining_video },
  { key: "food_real", seconds: 7, source: "REAL_ASSET_SEQUENCE", asset_ids: [SOURCE.food_striploin, SOURCE.food_carpaccio, SOURCE.food_salmon, SOURCE.food_nachos, SOURCE.food_salad] },
  { key: "food_to_pool", seconds: 8, source: "GENERATED_TRANSITION", shot: "food_to_pool" },
  { key: "pool_real", seconds: 5, source: "REAL_VIDEO_AND_STILL", asset_ids: [SOURCE.pool_video, SOURCE.pool_still] },
  { key: "pool_to_shuffleboard", seconds: 8, source: "GENERATED_TRANSITION", shot: "pool_to_shuffleboard" },
  { key: "shuffleboard_real", seconds: 4, source: "REAL_ASSET", asset_id: SOURCE.shuffleboard },
  { key: "shuffleboard_to_stage", seconds: 8, source: "GENERATED_TRANSITION", shot: "shuffleboard_to_stage" },
  { key: "singer_band_real", seconds: 10, source: "REAL_ASSET_AND_VIDEO", asset_ids: [SOURCE.singer_identity, SOURCE.band, SOURCE.stage_video] },
  { key: "night_reality", seconds: 7, source: "REAL_SOURCE_COMPOSITE", asset_ids: [SOURCE.dinner_social, SOURCE.pool_still, SOURCE.stage_video] },
  { key: "logo_close", seconds: 8, source: "AUTHENTIC_LOGO", effect: "longer premium 3D logo close with clean afterglow and final hold" },
]);

const EDIT_SECONDS = EDIT_PLAN.reduce((sum, item) => sum + Number(item.seconds || 0), 0);
if (EDIT_SECONDS !== MASTER_SECONDS) {
  throw new Error(`CHURCHILL_V2_EDIT_DURATION_INVALID:${EDIT_SECONDS}`);
}

function text(value) {
  return String(value ?? "").trim();
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function shotContract(shotKey) {
  const shot = SHOTS[shotKey];
  if (!shot) return null;
  return {
    title: `Churchill — ${shot.title}`,
    intent: shot.intent,
    requirements: {
      ...shot.requirements,
      authenticity: AUTHENTICITY,
      negative_constraints: COMMON_NEGATIVES,
    },
    shot_bible: {
      source: {
        reference_asset_ids: shot.reference_asset_ids,
      },
      precision_control: {
        opening_frame_asset_id: shot.opening_asset_id,
        closing_frame_asset_id: shot.closing_asset_id,
        exact_last_frame_required: true,
        reference_asset_ids: shot.reference_asset_ids,
        multi_reference_control_required: true,
      },
      frame_plan: {
        opening_frame: { asset_id: shot.opening_asset_id },
        closing_frame: { asset_id: shot.closing_asset_id },
      },
      output: {
        duration_seconds: MOTION_SECONDS,
        aspect_ratio: "16:9",
        resolution: "1080p",
      },
    },
    output_spec: {
      duration_seconds: MOTION_SECONDS,
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    provider_parameters: {
      first_frame_asset_id: shot.opening_asset_id,
      last_frame_asset_id: shot.closing_asset_id,
      reference_asset_ids: shot.reference_asset_ids,
      aspect_ratio: "16:9",
      resolution: "1080p",
    },
    primary_source_asset_id: shot.opening_asset_id,
  };
}

async function validateSourceAssets() {
  const ids = [...new Set(Object.values(SOURCE))];
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,name,file_name,asset_type,file_url,provider,ai_generated,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data || []).map((asset) => [asset.id, asset]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error(`CHURCHILL_V2_AUTHENTIC_SOURCE_MISSING:${missing.join(",")}`);
  }
  const exactLogo = byId.get(SOURCE.logo_exact);
  if (!exactLogo || exactLogo.ai_generated === true) {
    throw new Error("CHURCHILL_V2_EXACT_LOGO_UPLOAD_REQUIRED");
  }
  for (const id of [
    SOURCE.entrance_still,
    SOURCE.dinner_social,
    SOURCE.food_striploin,
    SOURCE.food_carpaccio,
    SOURCE.food_salmon,
    SOURCE.pool_still,
    SOURCE.shuffleboard,
    SOURCE.singer_identity,
    SOURCE.band,
  ]) {
    const asset = byId.get(id);
    if (!asset || asset.ai_generated === true) {
      throw new Error(`CHURCHILL_V2_USER_SOURCE_REQUIRED:${id}`);
    }
  }
  return { assets: data || [], byId };
}

async function findMission() {
  const { data, error } = await supabaseAdmin
    .from("creative_missions")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("metadata->>command_identity", COMMAND_IDENTITY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function ensureStudioProject() {
  await validateSourceAssets();
  const selectedAssetIds = [...new Set(Object.values(SOURCE))];
  const objective =
    "Create a 90-second world-class Churchill Bar & Restaurant cinematic night film using authentic Churchill assets as source of truth and four governed precision transitions. Preserve the exact Churchill 3D logo, real venue, real food, real pool, real shuffleboard, electronic darts visual language, real singer identity and real band. The future feeling must come from camera physics, reflections, time fracture, match-cuts and sound design rather than redesigning Churchill.";

  let mission = await findMission();
  if (!mission) {
    mission = await CreativeMissionRuntime.create({
      organization_id: ORGANIZATION_ID,
      title: "Churchill — The Night Changes · 90s",
      business_goal: "Create Churchill's flagship world-class venue film for website, social and paid advertising.",
      objective,
      channels: ["website", "youtube", "facebook", "instagram"],
      metadata: {
        source: "creative_studio",
        command_identity: COMMAND_IDENTITY,
        production_type: "VIDEO",
        target_duration: MASTER_SECONDS,
        duration_mode: "FIXED",
        temporal_contract: { duration_seconds: MASTER_SECONDS, fps: 24, aspect_ratio: "16:9" },
        selected_asset_ids: selectedAssetIds,
        authenticity_contract: AUTHENTICITY,
        edit_plan: EDIT_PLAN,
        generated_transition_policy: {
          provider: MOTION_PROVIDER,
          model: MOTION_MODEL,
          count: Object.keys(SHOTS).length,
          seconds_each: MOTION_SECONDS,
          total_generated_seconds: Object.keys(SHOTS).length * MOTION_SECONDS,
          remaining_seconds_use_authentic_churchill_media: MASTER_SECONDS - Object.keys(SHOTS).length * MOTION_SECONDS,
        },
        publication_authorized: false,
      },
    });
  } else {
    mission = await CreativeMissionRuntime.update(mission.id, {
      objective,
      metadata: {
        ...(mission.metadata || {}),
        command_identity: COMMAND_IDENTITY,
        production_type: "VIDEO",
        target_duration: MASTER_SECONDS,
        duration_mode: "FIXED",
        temporal_contract: { duration_seconds: MASTER_SECONDS, fps: 24, aspect_ratio: "16:9" },
        selected_asset_ids: selectedAssetIds,
        authenticity_contract: AUTHENTICITY,
        edit_plan: EDIT_PLAN,
        publication_authorized: false,
      },
    });
  }

  const started = await CreativeMissionRuntime.start(mission.id);
  const projectId = started.runtime_context?.creative_project_id;
  if (!projectId) throw new Error("CHURCHILL_V2_CREATIVE_PROJECT_REQUIRED");
  let project = await CreativeProjectRuntime.get(projectId);
  project = await CreativeProjectRuntime.update(project.id, {
    objective,
    production_type: "VIDEO",
    target_duration: MASTER_SECONDS,
    metadata: {
      ...(project.metadata || {}),
      command_identity: COMMAND_IDENTITY,
      selected_asset_ids: selectedAssetIds,
      source_asset_manifest: SOURCE,
      authenticity_contract: AUTHENTICITY,
      edit_plan: EDIT_PLAN,
      shot_catalog: Object.fromEntries(
        Object.entries(SHOTS).map(([key, shot]) => [key, {
          title: shot.title,
          editorial_role: shot.editorial_role,
          opening_asset_id: shot.opening_asset_id,
          closing_asset_id: shot.closing_asset_id,
          reference_asset_ids: shot.reference_asset_ids,
          generated_seconds: MOTION_SECONDS,
          provider: MOTION_PROVIDER,
          model: MOTION_MODEL,
        }]),
      ),
      churchill_night_changes_v2: {
        ...(project.metadata?.churchill_night_changes_v2 || {}),
        contract: FILM_CONTRACT,
        status: project.metadata?.churchill_night_changes_v2?.status || "PREPARED",
        duration_seconds: MASTER_SECONDS,
        publication_authorized: false,
        updated_at: new Date().toISOString(),
      },
    },
  });
  return { mission, project };
}

async function loadProjectState() {
  const mission = await findMission();
  if (!mission) return { mission: null, project: null, state: null };
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    mission,
    project: data || null,
    state: data?.metadata?.churchill_night_changes_v2 || null,
  };
}

async function patchState(project, patch = {}) {
  const metadata = project.metadata || {};
  const current = metadata.churchill_night_changes_v2 || {};
  const next = {
    ...current,
    ...patch,
    shots: {
      ...(current.shots || {}),
      ...(patch.shots || {}),
    },
    contract: FILM_CONTRACT,
    duration_seconds: MASTER_SECONDS,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const updated = await CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...metadata,
      churchill_night_changes_v2: next,
    },
  });
  return { project: updated, state: next };
}

async function startShot(shotKey) {
  const shot = SHOTS[shotKey];
  if (!shot) throw new Error("CHURCHILL_V2_SHOT_NOT_FOUND");
  const { project } = await ensureStudioProject();
  const existing = project.metadata?.churchill_night_changes_v2?.shots?.[shotKey] || null;
  if (existing?.status === "COMPLETED" && existing?.output_reference) {
    return { success: true, reused: true, shot: shotKey, state: existing };
  }
  if (existing?.status === "PROCESSING" && existing?.provider_job_id && existing?.usage_id) {
    return { success: true, reused: true, shot: shotKey, state: existing };
  }

  const contract = shotContract(shotKey);
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: MOTION_PROVIDER,
    provider_policy: {
      allowed_providers: [MOTION_PROVIDER],
      preferred_providers: [MOTION_PROVIDER],
    },
    input: {
      ...contract,
      creative_project_id: project.id,
      creative_mission_id: project.creative_mission_id || null,
      quantity: MOTION_SECONDS,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_${shotKey.toUpperCase()}`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: project.id,
      creative_mission_id: project.creative_mission_id || null,
      film_contract: FILM_CONTRACT,
      shot_key: shotKey,
      opening_asset_id: shot.opening_asset_id,
      closing_asset_id: shot.closing_asset_id,
      reference_asset_ids: shot.reference_asset_ids,
      authenticity_contract: AUTHENTICITY.contract,
      publication_authorized: false,
    },
    category: "AI",
  });

  const shotState = {
    status: result?.pending ? "PROCESSING" : "COMPLETED",
    provider: result?.provider || MOTION_PROVIDER,
    model: result?.model || MOTION_MODEL,
    provider_job_id: result?.provider_job_id || null,
    provider_status: result?.provider_status || null,
    usage_id: result?.usage?.id || null,
    credential_id: result?.credential_id || null,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    opening_asset_id: shot.opening_asset_id,
    closing_asset_id: shot.closing_asset_id,
    reference_asset_ids: shot.reference_asset_ids,
    duration_seconds: MOTION_SECONDS,
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || null),
    identity_policy: "NO_GENERATED_SINGER_CLOSEUP",
    publication_authorized: false,
  };
  await patchState(project, { status: "GENERATING_TRANSITIONS", shots: { [shotKey]: shotState } });
  return { success: true, reused: false, shot: shotKey, state: shotState };
}

async function pollShot(shotKey) {
  if (!SHOTS[shotKey]) throw new Error("CHURCHILL_V2_SHOT_NOT_FOUND");
  const loaded = await loadProjectState();
  if (!loaded.project) throw new Error("CHURCHILL_V2_PROJECT_NOT_PREPARED");
  const current = loaded.state?.shots?.[shotKey] || null;
  if (!current) throw new Error("CHURCHILL_V2_SHOT_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, shot: shotKey, state: current };
  }
  if (!current.provider || !current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_V2_PENDING_SHOT_STATE_INCOMPLETE");
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
      creative_project_id: loaded.project.id,
      creative_mission_id: loaded.project.creative_mission_id || null,
    },
    metadata: {
      module: "CREATIVE",
      operation: `CHURCHILL_NIGHT_CHANGES_${shotKey.toUpperCase()}_POLL`,
      command_identity: COMMAND_IDENTITY,
      creative_project_id: loaded.project.id,
      film_contract: FILM_CONTRACT,
      shot_key: shotKey,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failedState = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Provider generation failed",
      completed_at: new Date().toISOString(),
    };
    await patchState(loaded.project, { status: "TRANSITION_REPAIR_REQUIRED", shots: { [shotKey]: failedState } });
    return { success: false, pending: false, failed: true, shot: shotKey, state: failedState };
  }

  if (result?.pending) {
    const pendingState = {
      ...current,
      status: "PROCESSING",
      provider_status: result.provider_status || current.provider_status || "processing",
      last_polled_at: new Date().toISOString(),
    };
    await patchState(loaded.project, { shots: { [shotKey]: pendingState } });
    return { success: true, pending: true, shot: shotKey, state: pendingState };
  }

  const outputReference =
    result?.output?.url ||
    result?.output?.file_url ||
    result?.output?.video_url ||
    result?.output?.raw?.output?.storage_reference ||
    result?.output?.raw?.output?.file_url ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_V2_COMPLETED_SHOT_OUTPUT_REQUIRED");

  const completedState = {
    ...current,
    status: "COMPLETED",
    provider_status: result.provider_status || "completed",
    settlement: result.settlement || null,
    pricing: result.pricing || current.pricing || null,
    output_reference: outputReference,
    completed_at: new Date().toISOString(),
    error: null,
  };
  const allShots = {
    ...(loaded.state?.shots || {}),
    [shotKey]: completedState,
  };
  const allComplete = Object.keys(SHOTS).every((key) => allShots[key]?.status === "COMPLETED" && allShots[key]?.output_reference);
  await patchState(loaded.project, {
    status: allComplete ? "TRANSITIONS_READY" : "GENERATING_TRANSITIONS",
    shots: { [shotKey]: completedState },
  });
  return { success: true, pending: false, shot: shotKey, all_complete: allComplete, state: completedState };
}

async function status() {
  const loaded = await loadProjectState();
  if (!loaded.mission) {
    return {
      success: true,
      status: "NOT_PREPARED",
      film_contract: FILM_CONTRACT,
      duration_seconds: MASTER_SECONDS,
      authenticity_contract: AUTHENTICITY,
      edit_plan: EDIT_PLAN,
    };
  }
  const shots = Object.fromEntries(
    Object.keys(SHOTS).map((key) => [key, loaded.state?.shots?.[key] || { status: "NOT_STARTED" }]),
  );
  const completed = Object.values(shots).filter((shot) => shot.status === "COMPLETED" && shot.output_reference).length;
  const processing = Object.values(shots).filter((shot) => shot.status === "PROCESSING").length;
  const failed = Object.values(shots).filter((shot) => shot.status === "FAILED").length;
  return {
    success: true,
    film_contract: FILM_CONTRACT,
    status: loaded.state?.status || "PREPARED",
    mission_id: loaded.mission.id,
    creative_project_id: loaded.project?.id || null,
    duration_seconds: MASTER_SECONDS,
    transition_progress: {
      completed,
      processing,
      failed,
      total: Object.keys(SHOTS).length,
    },
    shots,
    edit_plan: EDIT_PLAN,
    authenticity_contract: AUTHENTICITY,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    const shotKey = text(url.searchParams.get("shot"));

    if (action === "catalog") {
      return json({
        success: true,
        film_contract: FILM_CONTRACT,
        duration_seconds: MASTER_SECONDS,
        source_asset_manifest: SOURCE,
        authenticity_contract: AUTHENTICITY,
        edit_plan: EDIT_PLAN,
        generated_shots: Object.fromEntries(
          Object.entries(SHOTS).map(([key, shot]) => [key, {
            title: shot.title,
            editorial_role: shot.editorial_role,
            opening_asset_id: shot.opening_asset_id,
            closing_asset_id: shot.closing_asset_id,
            reference_asset_ids: shot.reference_asset_ids,
            duration_seconds: MOTION_SECONDS,
            provider: MOTION_PROVIDER,
            model: MOTION_MODEL,
          }]),
        ),
        production_policy: {
          generated_transition_seconds: Object.keys(SHOTS).length * MOTION_SECONDS,
          authentic_churchill_seconds: MASTER_SECONDS - Object.keys(SHOTS).length * MOTION_SECONDS,
          generated_singer_closeup: false,
          generated_band_replacement: false,
          exact_logo_from_source: true,
          publication_authorized: false,
        },
      });
    }

    if (action === "prepare") {
      const { mission, project } = await ensureStudioProject();
      return json({
        success: true,
        status: "PREPARED",
        mission_id: mission.id,
        creative_project_id: project.id,
        duration_seconds: MASTER_SECONDS,
        transition_count: Object.keys(SHOTS).length,
        authenticity_contract: AUTHENTICITY,
        publication_authorized: false,
      });
    }

    if (action === "status") return json(await status());
    if (action === "start-shot") {
      if (!shotKey) return json({ success: false, error: "shot required" }, 400);
      return json(await startShot(shotKey));
    }
    if (action === "poll-shot") {
      if (!shotKey) return json({ success: false, error: "shot required" }, 400);
      return json(await pollShot(shotKey));
    }

    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_CHURCHILL_NIGHT_CHANGES_V2_FAILED", {
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
