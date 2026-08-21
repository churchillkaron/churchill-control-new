export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { CreativeMissionRuntime } from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CHURCHILL_NIGHT_CHANGES_STORY,
  CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
  assertChurchillNightStoryIntegrity,
} from "@/lib/creative/concepts/ChurchillNightChangesStoryContract";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const TOKEN = "churchill-night-changes-v3-20260821";
const COMMAND_IDENTITY = "CHURCHILL_THE_NIGHT_INSIDE_THE_NIGHT_90S_V3";
const FILM_CONTRACT = "CHURCHILL_AUTHENTIC_WORLDCLASS_FILM_V3";
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

const CONVERSATION_REFERENCES = Object.freeze({
  cocktail: Object.freeze({
    file_id: "file_00000000c9448207bebbe8374807d602",
    name: "coctail.png",
    role: "VFX_COCKTAIL_ICE_LIGHTING_REFERENCE",
    usage_policy:
      "Reference only until ingested into Creative Storage. Use its cut-glass tumbler, large ice cube, amber drink, candle and warm black/gold visual language. Do not treat background architecture as authoritative Churchill geometry unless matched by real venue media.",
  }),
  electronic_darts: Object.freeze({
    file_id: "file_00000000900c8209ab89969c1a99c06d",
    name: "darts.png",
    role: "ELECTRONIC_DARTS_EQUIPMENT_REFERENCE",
    usage_policy:
      "Reference the electronic dartboards plus score screens and amber ring/light language. Traditional, sisal, bristle, cork and vintage dartboards are forbidden. Venue geometry remains governed by authentic Churchill source media.",
  }),
});

const PRODUCTION_BEATS = Object.freeze([
  {
    id: "logo_prologue",
    source_mode: "AUTHENTIC_COMPOSITE",
    source_asset_ids: [SOURCE.logo_motion_existing, SOURCE.logo_exact],
    vfx: ["3D dimensional extension", "restrained amber afterglow", "Churchill Pulse origin"],
  },
  {
    id: "entrance_into_night",
    source_mode: "AUTHENTIC_VIDEO",
    source_asset_ids: [SOURCE.entrance_video, SOURCE.entrance_still],
    vfx: ["impossible controlled forward camera", "practical reflection handoff"],
  },
  {
    id: "wine_universe",
    source_mode: "GENERATED_VFX_INSERT_WITH_AUTHENTIC_ENDPOINTS",
    endpoint_asset_ids: [SOURCE.dinner_social, SOURCE.pool_still, SOURCE.shuffleboard, SOURCE.band],
    reference_asset_ids: [SOURCE.logo_exact],
    vfx: [
      "macro red-wine liquid physics",
      "suspended wine droplets containing miniature moving Churchill realities",
      "camera enters one physically plausible droplet/reflection",
      "singer foreshadow reflection from protected real identity",
      "Churchill Pulse appears only as physical amber refraction",
    ],
  },
  {
    id: "dinner_future_reflections",
    source_mode: "AUTHENTIC_MEDIA_PLUS_REFLECTION_COMPOSITE",
    source_asset_ids: [
      SOURCE.dining_video,
      SOURCE.dinner_social,
      SOURCE.food_striploin,
      SOURCE.food_carpaccio,
      SOURCE.food_salmon,
      SOURCE.food_nachos,
      SOURCE.food_salad,
    ],
    protected_identity_asset_ids: [SOURCE.singer_identity],
    vfx: ["future singer reflection", "electronic-darts reflection", "natural recurring guest continuity"],
  },
  {
    id: "steam_into_bar",
    source_mode: "GENERATED_VFX_BRIDGE",
    source_asset_ids: [SOURCE.food_carpaccio, SOURCE.dinner_social],
    vfx: ["real food steam becomes real-world bar mist", "single continuous camera event"],
  },
  {
    id: "ice_time_freeze",
    source_mode: "GENERATED_VFX_INSERT_WITH_AUTHENTIC_ENDPOINT",
    endpoint_asset_ids: [SOURCE.pool_still],
    conversation_reference: CONVERSATION_REFERENCES.cocktail,
    vfx: [
      "ice throw/pour triggers freeze-time",
      "suspended ice and liquid while camera alone moves",
      "macro travel through droplets and ice",
      "real pool room refracted inside one ice cube",
      "ice cube becomes cue ball",
      "Churchill Pulse appears as realistic amber refraction only",
    ],
  },
  {
    id: "pool_activation",
    source_mode: "AUTHENTIC_VIDEO",
    source_asset_ids: [SOURCE.pool_video, SOURCE.pool_still, SOURCE.pool_staff],
    vfx: ["cue-ball continuation from ice", "real table branding lock", "stage-light foreshadow inside ball"],
  },
  {
    id: "pool_to_shuffleboard",
    source_mode: "GENERATED_VFX_INSERT_WITH_AUTHENTIC_ENDPOINTS",
    endpoint_asset_ids: [SOURCE.pool_still, SOURCE.shuffleboard],
    vfx: ["pool-ball foreground occlusion becomes shuffleboard puck", "2cm-low camera chase"],
  },
  {
    id: "shuffleboard_to_dart",
    source_mode: "GENERATED_OBJECT_TRANSFORM",
    endpoint_asset_ids: [SOURCE.shuffleboard],
    vfx: ["puck reaches/falls from scoring end", "puck becomes dart", "hand catches dart"],
  },
  {
    id: "electric_dart_flight",
    source_mode: "GENERATED_VFX_WITH_AUTHENTIC_VENUE_AND_EQUIPMENT_LOCK",
    source_asset_ids: [SOURCE.pool_still, SOURCE.dinner_social, SOURCE.shuffleboard, SOURCE.stage_video],
    conversation_reference: CONVERSATION_REFERENCES.electronic_darts,
    vfx: [
      "viewer travels with dart through authentic Churchill layers",
      "electronic boards with score screens only",
      "bullseye impact and 0.3–0.5s near-silence",
      "electronic target ring expands into stage spotlight",
    ],
  },
  {
    id: "band_activates_churchill",
    source_mode: "AUTHENTIC_IDENTITY_AND_STAGE",
    source_asset_ids: [SOURCE.singer_identity, SOURCE.band, SOURCE.stage_video],
    vfx: [
      "kick activates bar",
      "snare activates pool",
      "bass activates dinner",
      "keyboard activates shuffleboard",
      "guitar/percussion activates electronic darts",
      "full band releases full venue",
    ],
  },
  {
    id: "many_realities_same_night",
    source_mode: "AUTHENTIC_MULTITEMPORAL_COMPOSITE",
    source_asset_ids: [SOURCE.dinner_social, SOURCE.pool_still, SOURCE.shuffleboard, SOURCE.stage_video],
    vfx: ["same recurring guest group at several times in one physical Churchill", "future/past reflection easter eggs"],
  },
  {
    id: "frozen_night_hero",
    source_mode: "WORLDCLASS_FREEZE_TIME_COMPOSITE",
    source_asset_ids: [
      SOURCE.dinner_social,
      SOURCE.food_striploin,
      SOURCE.pool_still,
      SOURCE.shuffleboard,
      SOURCE.singer_identity,
      SOURCE.band,
      SOURCE.stage_video,
    ],
    conversation_references: [CONVERSATION_REFERENCES.cocktail, CONVERSATION_REFERENCES.electronic_darts],
    vfx: [
      "wine mid-pour frozen",
      "cocktail liquid and ice suspended",
      "food/cutlery action frozen",
      "pool ball moving",
      "shuffleboard puck moving",
      "electronic dart in flight",
      "singer and drummer frozen mid-performance",
      "guests frozen mid-laugh/dance",
      "one red-wine droplet still contains moving Churchill",
      "camera enters moving wine droplet",
    ],
  },
  {
    id: "wine_loop_return",
    source_mode: "AUTHENTIC_DINNER_LOOP",
    source_asset_ids: [SOURCE.dinner_social],
    vfx: ["return through wine/glass to original dinner reality"],
  },
  {
    id: "logo_epilogue",
    source_mode: "AUTHENTIC_COMPOSITE",
    source_asset_ids: [SOURCE.logo_exact, SOURCE.logo_motion_existing],
    vfx: ["longer premium 3D finish", "restrained afterglow", "clean Churchill hold"],
  },
]);

const AVANTIQO_DERIVATIVES = Object.freeze({
  hero_film_credit: {
    optional: true,
    maximum_seconds: 2,
    copy: "CREATED IN AVANTIQO · Autonomous Creative Studio",
    rule: "May appear only after Churchill has fully resolved and only if it does not weaken the Churchill logo hold.",
  },
  proof_film: {
    duration_target_seconds: 25,
    separate_from_hero: true,
    concept:
      "Show authentic Churchill source references beside selected finished impossible shots to prove that Avantiqo orchestrated strategy, direction, generation/VFX, sound and assembly while preserving the real brand and venue.",
  },
  cutdowns: [
    { name: "Churchill 30s campaign cut", seconds: 30 },
    { name: "Wine + ice teaser", seconds: 15 },
    { name: "Dart flight + band teaser", seconds: 15 },
    { name: "Churchill logo bumper", seconds: 6 },
  ],
});

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function text(value) {
  return String(value ?? "").trim();
}

function validateProductionBeats() {
  assertChurchillNightStoryIntegrity();
  const canonical = CHURCHILL_NIGHT_CHANGES_STORY.canonical_beats;
  const production = new Map(PRODUCTION_BEATS.map((item) => [item.id, item]));
  const missing = canonical.filter((item) => item.mandatory && !production.has(item.id)).map((item) => item.id);
  if (missing.length) throw new Error(`CHURCHILL_V3_EXECUTABLE_STORY_MISSING:${missing.join(",")}`);
  if (canonical.reduce((sum, item) => sum + Number(item.target_seconds || 0), 0) !== MASTER_SECONDS) {
    throw new Error("CHURCHILL_V3_CANONICAL_DURATION_INVALID");
  }
  return true;
}

async function validateCreativeSources() {
  const ids = [...new Set(Object.values(SOURCE))];
  const { data, error } = await supabaseAdmin
    .from("creative_assets")
    .select("id,name,file_name,asset_type,ai_generated,provider,metadata")
    .eq("organization_id", ORGANIZATION_ID)
    .in("id", ids);
  if (error) throw error;
  const byId = new Map((data || []).map((item) => [item.id, item]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`CHURCHILL_V3_SOURCE_MISSING:${missing.join(",")}`);

  for (const id of [
    SOURCE.logo_exact,
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
    if (byId.get(id)?.ai_generated === true) throw new Error(`CHURCHILL_V3_AUTHENTIC_UPLOAD_REQUIRED:${id}`);
  }
  return { byId, assets: data || [] };
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

async function ensureProject() {
  validateProductionBeats();
  await validateCreativeSources();
  const selectedAssetIds = [...new Set(Object.values(SOURCE))];
  const objective =
    "Create the locked 90-second Churchill — The Night Inside The Night world-class film. The agreed story is immutable without explicit user approval. Preserve real Churchill geometry, food, pool, shuffleboard, electronic darts, singer, band and exact 3D logo. Use generated VFX only for impossible physics/camera/time events. Provider fallback may change provider but never the story.";

  let mission = await findMission();
  if (!mission) {
    mission = await CreativeMissionRuntime.create({
      organization_id: ORGANIZATION_ID,
      title: "Churchill — The Night Inside The Night · Canonical 90s V3",
      business_goal: "Create a talked-about world-class Churchill hero film that also becomes proof of Avantiqo Creative Studio capability.",
      objective,
      channels: ["website", "youtube", "facebook", "instagram"],
      metadata: {
        source: "creative_studio",
        command_identity: COMMAND_IDENTITY,
        production_type: "VIDEO",
        target_duration: MASTER_SECONDS,
        duration_mode: "FIXED",
        canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
        canonical_story: CHURCHILL_NIGHT_CHANGES_STORY,
        production_beats: PRODUCTION_BEATS,
        selected_asset_ids: selectedAssetIds,
        conversation_references_pending_ingest: CONVERSATION_REFERENCES,
        avantiqo_derivatives: AVANTIQO_DERIVATIVES,
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
        canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
        canonical_story: CHURCHILL_NIGHT_CHANGES_STORY,
        production_beats: PRODUCTION_BEATS,
        selected_asset_ids: selectedAssetIds,
        conversation_references_pending_ingest: CONVERSATION_REFERENCES,
        avantiqo_derivatives: AVANTIQO_DERIVATIVES,
        publication_authorized: false,
      },
    });
  }

  const started = await CreativeMissionRuntime.start(mission.id);
  const projectId = started.runtime_context?.creative_project_id;
  if (!projectId) throw new Error("CHURCHILL_V3_CREATIVE_PROJECT_REQUIRED");
  let project = await CreativeProjectRuntime.get(projectId);
  project = await CreativeProjectRuntime.update(project.id, {
    objective,
    production_type: "VIDEO",
    target_duration: MASTER_SECONDS,
    metadata: {
      ...(project.metadata || {}),
      command_identity: COMMAND_IDENTITY,
      film_contract: FILM_CONTRACT,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      canonical_story: CHURCHILL_NIGHT_CHANGES_STORY,
      production_beats: PRODUCTION_BEATS,
      source_asset_manifest: SOURCE,
      conversation_references_pending_ingest: CONVERSATION_REFERENCES,
      avantiqo_derivatives: AVANTIQO_DERIVATIVES,
      story_lock: {
        user_story_locked: true,
        provider_fallback_may_not_change_story: true,
        runtime_failure_may_not_change_story: true,
        story_removal_requires_explicit_user_approval: true,
      },
      status: "CANONICAL_STORY_LOCKED_PREPRODUCTION",
      publication_authorized: false,
      updated_at: new Date().toISOString(),
    },
  });
  return { mission, project };
}

async function status() {
  validateProductionBeats();
  const mission = await findMission();
  if (!mission) {
    return {
      success: true,
      status: "NOT_PREPARED",
      film_contract: FILM_CONTRACT,
      canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
      duration_seconds: MASTER_SECONDS,
      mandatory_beat_count: CHURCHILL_NIGHT_CHANGES_STORY.canonical_beats.length,
      conversation_references_pending_ingest: CONVERSATION_REFERENCES,
      publication_authorized: false,
    };
  }
  const { data: project, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,creative_mission_id,target_duration,metadata,updated_at")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("creative_mission_id", mission.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return {
    success: true,
    status: project?.metadata?.status || "MISSION_READY_PROJECT_PENDING",
    film_contract: FILM_CONTRACT,
    canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
    mission_id: mission.id,
    creative_project_id: project?.id || null,
    duration_seconds: MASTER_SECONDS,
    mandatory_beat_count: CHURCHILL_NIGHT_CHANGES_STORY.canonical_beats.length,
    production_beat_count: PRODUCTION_BEATS.length,
    story_lock: project?.metadata?.story_lock || null,
    conversation_references_pending_ingest: CONVERSATION_REFERENCES,
    avantiqo_derivatives: AVANTIQO_DERIVATIVES,
    publication_authorized: false,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();

    if (action === "catalog") {
      validateProductionBeats();
      return json({
        success: true,
        film_contract: FILM_CONTRACT,
        canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
        canonical_story: CHURCHILL_NIGHT_CHANGES_STORY,
        production_beats: PRODUCTION_BEATS,
        source_asset_manifest: SOURCE,
        conversation_references_pending_ingest: CONVERSATION_REFERENCES,
        avantiqo_derivatives: AVANTIQO_DERIVATIVES,
        publication_authorized: false,
      });
    }

    if (action === "prepare") {
      const { mission, project } = await ensureProject();
      return json({
        success: true,
        status: "CANONICAL_STORY_LOCKED_PREPRODUCTION",
        mission_id: mission.id,
        creative_project_id: project.id,
        canonical_story_version: CHURCHILL_NIGHT_CHANGES_STORY_VERSION,
        duration_seconds: MASTER_SECONDS,
        mandatory_beat_count: CHURCHILL_NIGHT_CHANGES_STORY.canonical_beats.length,
        production_beat_count: PRODUCTION_BEATS.length,
        story_lock: project.metadata?.story_lock || null,
        conversation_references_pending_ingest: CONVERSATION_REFERENCES,
        publication_authorized: false,
      });
    }

    if (action === "status") return json(await status());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CREATIVE_CHURCHILL_NIGHT_CHANGES_V3_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
