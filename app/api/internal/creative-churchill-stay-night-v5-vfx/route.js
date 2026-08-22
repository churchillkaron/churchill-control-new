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
const VERSION = "CHURCHILL_STAY_FOR_THE_NIGHT_V5_AUTHENTIC_VFX_RUNTIME";

const ASSETS = Object.freeze({
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  striploin: "9a7f96b4-1c77-47f5-8377-69f0404929ee",
  carpaccio: "e767ad1c-e9ba-4bc3-aebc-525e963a8c78",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  pool_video: "d10ddc3a-386f-403b-9bb4-2cfe40c7c655",
  electronic_darts: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
  shuffleboard: "23756544-16cd-4d76-9e26-2e11bdde8c23",
  shuffleboard_ref: "4357898f-23fd-418f-af8d-89e3719c0969",
  singer: "370a3030-8656-4b28-934f-6653d5eaf3c8",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
  stage_video: "dcd86649-42f8-4f7a-be91-00c456eb940d",
});

const GLOBAL_AUTHENTICITY = `\n\nAUTHENTICITY / EDITORIAL LOCK:\nThis is a VFX plate for the real Churchill Restaurant & Bar in Karon, Phuket. The generated material may create ONLY impossible camera movement, liquid, steam, ice, object transition, time-freeze or optical physics. It may NOT invent a replacement Churchill venue, fake singer, fake band, fake pool room, fake shuffleboard, fake electronic darts, fake signage, fake logos, new faces, or generic luxury-restaurant architecture.\n\nWhenever recognizable Churchill content is required inside a reflection, refraction, suspended droplet, ice cube, moving object or temporal echo, leave a physically plausible reflective/refractive surface or region that editorial can fill with the supplied AUTHENTIC Churchill source assets. Do not paint a fake version of Churchill into that region. Do not generate readable text. Do not generate a traditional/sisal/bristle/cork dartboard.\n\nVISUAL LANGUAGE:\nHigh-budget cinema / automotive / premium spirits craft. Photographic black levels, restrained warm amber practical reflections, deep burgundy wine, realistic surface tension, believable glass/metal/wood optics, fine-film contrast, clean motion. No hologram UI, cyberpunk, fantasy particles, neon rebuild, AI shimmer, rubbery liquid, warped geometry, floating screens, captions or title cards.`;

const SCENES = Object.freeze({
  scene_03_wine_universe: {
    label: "WINE UNIVERSE",
    duration: 5,
    final_duration: 5,
    primary: ASSETS.dinner,
    references: [ASSETS.dinner, ASSETS.pool, ASSETS.electronic_darts, ASSETS.shuffleboard, ASSETS.band, ASSETS.singer],
    operation: "CHURCHILL_V5_SCENE_03_WINE_UNIVERSE",
    editorial: "Composite authentic Churchill dinner, pool, electronic darts, shuffleboard and real singer/band into the prepared optical reflections. Never use generated venue content.",
    prompt: `Create a single 5-second 16:9 macro-cinematography VFX plate for Scene 03: WINE UNIVERSE. It follows directly after camera crosses the authentic Churchill entrance threshold.\n\n0.00-0.70 sec: warm darkness resolves into an extreme macro edge of a real wine glass / moving deep-red wine surface. Camera is physically close, shallow depth of field, real glass optics.\n0.70-2.20 sec: one elegant wine movement releases several suspended red-wine droplets. The droplets are physically plausible, not fantasy bubbles. Their curved surfaces contain dark, optically rich reflective cavities with tiny warm highlights. These cavities are deliberately clean enough for editorial to composite authentic Churchill realities later.\n2.20-3.80 sec: camera threads between 2-3 suspended droplets. One hero droplet becomes dominant. Its surface behaves like a real curved lens with realistic refraction, surface tension and fine specular rolloff. Leave multiple natural reflection zones suitable for authentic dinner, pool, electronic-darts, shuffleboard and live-stage inserts.\n3.80-5.00 sec: camera chooses the hero droplet and pushes through its physical liquid surface. The wine wraps around the lens and resolves toward a warm dinner-table light so the next authentic dinner shot can match perfectly.\n\nDo not generate miniature fake rooms, people, signage or game equipment inside the droplets. The Churchill worlds are added from real source assets in editorial. The generated task is only premium photographed wine/glass/liquid physics and the camera transition.` + GLOBAL_AUTHENTICITY,
  },

  scene_05_steam_into_bar: {
    label: "STEAM INTO BAR",
    duration: 4,
    final_duration: 4,
    primary: ASSETS.carpaccio,
    references: [ASSETS.carpaccio, ASSETS.dinner],
    operation: "CHURCHILL_V5_SCENE_05_STEAM_INTO_BAR",
    editorial: "Use authentic Churchill dinner/bar imagery as endpoints. Generated content is only the steam/mist bridge.",
    prompt: `Create a 4-second 16:9 photoreal transition plate for Scene 05: STEAM INTO BAR. Begin from a macro premium food-table context and use only natural hot-food steam / atmospheric mist as the impossible transition mechanism. Camera glides through physically believable warm steam; highlights remain restrained amber and burgundy. The steam fills frame, becomes denser for one beat, then opens toward a dark warm practical-light area designed for editorial to reveal the authentic Churchill bar. Do not invent the bar itself. No people, no signage, no architecture generation. This is a clean high-end steam/mist optical bridge with natural lens bloom and real volumetric falloff.` + GLOBAL_AUTHENTICITY,
  },

  scene_06_ice_time_freeze: {
    label: "ICE TIME FREEZE",
    duration: 5,
    final_duration: 5,
    primary: ASSETS.dinner,
    references: [ASSETS.dinner, ASSETS.pool],
    operation: "CHURCHILL_V5_SCENE_06_ICE_TIME_FREEZE",
    editorial: "Composite authentic Churchill bar action and real pool room into the generated frozen liquid/ice optics; land on authentic pool footage.",
    prompt: `Create a 5-second 16:9 premium macro VFX plate for Scene 06: ICE TIME FREEZE.\n\nStart with dark amber liquid and one large clear cocktail ice cube entering frame in believable bar lighting. At impact, time appears to freeze: multiple real-looking ice fragments and liquid droplets suspend in space while only the camera moves. Camera travels smoothly between the suspended droplets and ice with extremely realistic refraction, caustics and condensation.\n\nOne hero ice cube rotates slowly in front of camera. Keep its internal refractive volume optically clean and dark enough for editorial to composite the authentic Churchill pool room inside it. Do not invent a pool room. Camera pushes directly into the hero cube. In the final second, the cube curvature and white highlight evolve toward the geometry of a cue ball, ending on a clean circular white/cream surface suitable for a hard match into the authentic Churchill pool footage.\n\nNo fake bartender, no generated guests, no fake bar architecture. The plate is only frozen ice/liquid physics and the ice-to-cue-ball transition.` + GLOBAL_AUTHENTICITY,
  },

  scene_08_pool_to_shuffleboard: {
    label: "POOL TO SHUFFLEBOARD",
    duration: 4,
    final_duration: 4,
    primary: ASSETS.pool,
    references: [ASSETS.pool, ASSETS.shuffleboard, ASSETS.shuffleboard_ref],
    operation: "CHURCHILL_V5_SCENE_08_POOL_TO_SHUFFLEBOARD",
    editorial: "Start/end on authentic Churchill pool and shuffleboard assets. Generated plate supplies only foreground occlusion/object handoff.",
    prompt: `Create a 4-second 16:9 object-transition VFX plate for Scene 08: POOL TO SHUFFLEBOARD. Start extremely close to a moving glossy pool-ball-like dark foreground sphere crossing lens, without showing or inventing a pool room. The sphere fully occludes frame for a fraction of a second. Inside that natural blackout, its contact sound and motion language transform into a polished shuffleboard-puck-like object. Camera emerges only 2 cm above a real wood-like surface, chasing behind the puck with restrained speed. Keep the table surroundings abstract/dark and non-identifying so editorial can replace the endpoint with authentic Churchill shuffleboard geometry. End with the puck moving forward into a clean match point. No fake branding, no fake score markings, no venue generation.` + GLOBAL_AUTHENTICITY,
  },

  scene_09_shuffleboard_to_dart: {
    label: "SHUFFLEBOARD TO DART",
    duration: 4,
    final_duration: 4,
    primary: ASSETS.shuffleboard,
    references: [ASSETS.shuffleboard, ASSETS.electronic_darts],
    operation: "CHURCHILL_V5_SCENE_09_SHUFFLEBOARD_TO_DART",
    editorial: "Match authentic Churchill shuffleboard at start and authentic electronic darts at next scene. Do not use generated venue/equipment identity.",
    prompt: `Create a 4-second 16:9 physically elegant object-transform plate for Scene 09: SHUFFLEBOARD TO DART. A dark metallic shuffleboard-puck-like object reaches a table edge in extreme close-up. As it tips and falls, rotational momentum and a brief foreground occlusion allow the object to transform into a modern soft-tip electronic dart. The transformation must feel mechanically plausible and cinematic, never cartoon morphing. A human hand may enter only as a cropped anonymous silhouette/hand without face or identity and catch the dart cleanly. End on the dart held ready against a dark neutral Churchill-compatible background for the next authentic electronic-darts flight scene. No board is visible. No traditional dartboard. No text or branding.` + GLOBAL_AUTHENTICITY,
  },

  scene_10_electric_dart_flight: {
    label: "ELECTRIC DART FLIGHT",
    duration: 5,
    final_duration: 5,
    primary: ASSETS.electronic_darts,
    references: [ASSETS.electronic_darts, ASSETS.pool, ASSETS.shuffleboard, ASSETS.dinner, ASSETS.stage_video],
    operation: "CHURCHILL_V5_SCENE_10_ELECTRIC_DART_FLIGHT",
    editorial: "Use authentic Churchill venue layers and the real electronic darts reference. Generated plate supplies flight/camera physics only.",
    prompt: `Create a 5-second 16:9 high-speed action VFX plate for Scene 10: ELECTRIC DART FLIGHT. Viewer travels alongside/just behind a modern soft-tip electronic dart in flight. Keep the environment as dark shallow-depth-of-field practical-light streaks and neutral Churchill-compatible spatial layers, not a generated restaurant. Leave several clean passing foreground/background windows for editorial to composite authentic Churchill dinner, pool, shuffleboard and stage fragments.\n\nThe target at the end must be based on modern ELECTRONIC darts only: circular illuminated electronic target language and scoring-light feel, never sisal/bristle/cork/traditional board. Do not invent readable scoring text. Final 0.8 sec: dart reaches center target, impact creates a clean circular illuminated ring that expands toward lens and becomes a stage-spotlight aperture for the next authentic band scene. No fake guests or faces.` + GLOBAL_AUTHENTICITY,
  },

  scene_12_many_realities_same_night: {
    label: "MANY REALITIES SAME NIGHT",
    duration: 5,
    final_duration: 5,
    primary: ASSETS.dinner,
    references: [ASSETS.dinner, ASSETS.pool, ASSETS.shuffleboard, ASSETS.electronic_darts, ASSETS.stage_video],
    operation: "CHURCHILL_V5_SCENE_12_MANY_REALITIES",
    editorial: "Build the multi-temporal venue from authentic Churchill layers only. Generated plate provides optical time-transition mattes/reflections.",
    prompt: `Create a 5-second 16:9 premium optical/time-transition plate for Scene 12: MANY REALITIES · SAME NIGHT. Do not generate a venue or people. Create a continuous camera-like movement through dark warm practical reflections, glass edges, polished wood highlights and brief natural foreground occlusions. Build 4-5 elegant physically plausible reflection windows / moving masks that can hold separate authentic Churchill moments in editorial: dinner, cocktails, pool, shuffleboard, electronic darts and live music. The visual concept is several moments of one night coexisting in one physical place, but the generated plate must remain abstract physical optics only, never split screen, hologram or UI. End by converging the reflection windows into one continuous dark-warm field that prepares the whole-night freeze scene.` + GLOBAL_AUTHENTICITY,
  },

  scene_13_frozen_night_hero: {
    label: "FROZEN NIGHT HERO",
    duration: 5,
    final_duration: 5,
    primary: ASSETS.dinner,
    references: [ASSETS.dinner, ASSETS.pool, ASSETS.shuffleboard, ASSETS.electronic_darts, ASSETS.band, ASSETS.singer, ASSETS.stage_video],
    operation: "CHURCHILL_V5_SCENE_13_FROZEN_NIGHT_HERO",
    editorial: "Composite only authentic Churchill food, pool, shuffleboard, electronic darts, singer, drummer, band and guests into the frozen-time plate.",
    prompt: `Create a 5-second 16:9 world-class freeze-time VFX plate for Scene 13: FROZEN NIGHT HERO. The generated task is ONLY suspended physical elements and camera motion, never venue or people.\n\nCamera travels through a dark warm night-space containing physically realistic suspended red-wine droplets, a frozen ribbon of cocktail liquid, one or two clear ice fragments, a polished pool-ball-like sphere, a shuffleboard-puck-like object and a modern soft-tip dart silhouette. Arrange them in strong cinematic depth with clean areas around each object so editorial can composite authentic Churchill food/action, pool, shuffleboard, electronic darts and real band/guest layers behind and within them.\n\nOne red-wine droplet remains subtly alive while everything else is frozen. In the final second, camera selects that moving droplet and pushes into its deep burgundy surface, creating the return tunnel toward the original authentic dinner reality. No venue generation, no faces, no fake singer/band, no fake board.` + GLOBAL_AUTHENTICITY,
  },
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

function spec(sceneKey) {
  const value = SCENES[sceneKey];
  if (!value) throw new Error("CHURCHILL_V5_VFX_SCENE_UNSUPPORTED");
  return value;
}

async function project() {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("*")
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V5_PROJECT_NOT_FOUND");
  return data;
}

async function activeCredentialId() {
  const { data, error } = await supabaseAdmin
    .from("provider_credentials")
    .select("id")
    .eq("provider_id", PROVIDER)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
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
    scenes: {
      ...(current.scenes || {}),
      [sceneKey]: value,
    },
    story_change_authorized: true,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({
      metadata: { ...metadata, churchill_v5_scenes: next },
      updated_at: new Date().toISOString(),
    })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

async function start(sceneKey) {
  const s = spec(sceneKey);
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[sceneKey] || null;

  if (current?.status === "COMPLETED" && current?.output_reference) {
    return { success: true, reused: true, scene: sceneKey, state: current };
  }
  if (current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) {
    return { success: true, reused: true, scene: sceneKey, state: current };
  }

  const credentialId = await activeCredentialId();
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: {
      allowed_providers: [PROVIDER],
      preferred_providers: [PROVIDER],
    },
    input: {
      model: MODEL,
      primary_source_asset_id: s.primary,
      source: s.primary,
      selected_assets: [s.primary, ...s.references.filter((id) => id !== s.primary)],
      prompt: s.prompt,
      provider_prompt: s.prompt,
      media_duration_seconds: s.duration,
      duration_seconds: s.duration,
      output_spec: { duration_seconds: s.duration, aspect_ratio: "16:9" },
      generation: {
        model: MODEL,
        output_spec: { duration_seconds: s.duration, aspect_ratio: "16:9" },
      },
      provider_parameters: {
        aspect_ratio: "16:9",
        primary_source_asset_id: s.primary,
      },
      creative_project_id: PROJECT_ID,
      creative_mission_id: p.creative_mission_id || null,
      credential_id: credentialId,
      quantity: s.duration,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: s.operation,
      version: VERSION,
      creative_project_id: PROJECT_ID,
      scene_key: sceneKey,
      authentic_reference_asset_ids: s.references,
      generated_plate_only: true,
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
    final_editorial_duration_seconds: s.final_duration,
    primary_source_asset_id: s.primary,
    authentic_reference_asset_ids: s.references,
    generated_plate_only: true,
    authentic_editorial_composite_required: true,
    editorial_instruction: s.editorial,
    output_reference: result?.pending
      ? null
      : (result?.output?.file_url ||
          result?.output?.video_url ||
          result?.output?.url ||
          result?.output?.raw?.output?.storage_reference ||
          null),
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
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, scene: sceneKey, state: current };
  }
  if (!current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_V5_VFX_PENDING_STATE_INCOMPLETE");
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
      creative_project_id: PROJECT_ID,
      creative_mission_id: p.creative_mission_id || null,
    },
    metadata: {
      module: "CREATIVE",
      operation: `${s.operation}_POLL`,
      version: VERSION,
      creative_project_id: PROJECT_ID,
      scene_key: sceneKey,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || `${s.label} generation failed`,
      completed_at: new Date().toISOString(),
    };
    await patchScene(p, sceneKey, failed);
    return { success: false, failed: true, pending: false, scene: sceneKey, state: failed };
  }

  if (result?.pending) {
    const pending = {
      ...current,
      status: "PROCESSING",
      provider_status: result.provider_status || "processing",
      last_polled_at: new Date().toISOString(),
    };
    await patchScene(p, sceneKey, pending);
    return { success: true, pending: true, scene: sceneKey, state: pending };
  }

  const outputReference =
    result?.output?.file_url ||
    result?.output?.video_url ||
    result?.output?.url ||
    result?.output?.raw?.output?.storage_reference ||
    result?.output?.raw?.output?.file_url ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_V5_VFX_OUTPUT_REQUIRED");

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
    policy: {
      generated_plate_only: true,
      authentic_editorial_composite_required: true,
      generated_venue_replacement_allowed: false,
      generated_people_allowed: false,
      generated_logo_allowed: false,
      traditional_dartboard_allowed: false,
      visual_review_required: true,
      publication_authorized: false,
    },
  };
}

async function video(sceneKey) {
  const s = spec(sceneKey);
  const p = await project();
  const state = p.metadata?.churchill_v5_scenes?.scenes?.[sceneKey] || null;
  const ref = text(state?.output_reference);
  if (state?.status !== "COMPLETED" || !ref) {
    return json({ success: false, error: "CHURCHILL_V5_VFX_VIDEO_NOT_READY" }, 409);
  }

  if (ref.startsWith("storage://")) {
    const storagePath = ref.slice("storage://".length);
    const parts = storagePath.split("/").filter(Boolean);
    const bucket = parts.shift();
    const path = parts.join("/");
    if (!bucket || !path) throw new Error("CHURCHILL_V5_VFX_STORAGE_REFERENCE_INVALID");
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error) throw error;
    const bytes = await data.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `inline; filename="churchill-v5-${sceneKey}-${s.label.toLowerCase().replaceAll(" ", "-")}.mp4"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (/^https?:\/\//.test(ref)) {
    const upstream = await fetch(ref, { cache: "no-store" });
    if (!upstream.ok) throw new Error(`CHURCHILL_V5_VFX_UPSTREAM_${upstream.status}`);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Content-Disposition": `inline; filename="churchill-v5-${sceneKey}-${s.label.toLowerCase().replaceAll(" ", "-")}.mp4"`,
        "Cache-Control": "private, no-store",
      },
    });
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
    console.error("CHURCHILL_V5_VFX_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
