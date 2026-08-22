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
const TOKEN = "churchill-stay-night-v5-scene-01-20260822";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const VERSION = "CHURCHILL_STAY_FOR_THE_NIGHT_V5_SCENE_01_DROP";
const SCENE_KEY = "scene_01_the_drop";

const ASSETS = Object.freeze({
  dinner: "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b",
  pool: "797c9d16-5465-4e60-be93-a6c65707f7db",
  electronic_darts: "7bc9e891-e3d0-4b03-8b53-95ff255f31c6",
  shuffleboard: "4357898f-23fd-418f-af8d-89e3719c0969",
  band: "cb027610-625c-4751-99a0-6a41b3597237",
});

const SELECTED_ASSETS = Object.freeze([
  ASSETS.dinner,
  ASSETS.pool,
  ASSETS.electronic_darts,
  ASSETS.shuffleboard,
  ASSETS.band,
]);

const PROMPT = `Create a single photoreal 4-second 16:9 luxury hospitality-commercial opening plate for the real Churchill Restaurant & Bar in Karon, Phuket.

This is Scene 01: THE DROP. It must feel like a high-budget spirits, automotive or cinema commercial, never like a restaurant social-media ad.

TIMING AND CAMERA:
0.00-0.45 sec: pure near-black frame, only a tiny physically realistic warm reflection beginning to reveal itself. No text, no logo, no venue reveal.
0.45-1.55 sec: one suspended real red-wine droplet emerges from darkness in extreme macro. Black environment, deep burgundy wine, subtle warm amber practical reflections, beautiful physically correct liquid optics, shallow depth of field. The camera advances toward the droplet with restrained precision.
1.55-2.65 sec: as the camera gets close, the curved liquid surface contains tiny distorted reflections from the supplied authentic Churchill references: a real Churchill pool-table fragment, modern electronic-darts target/scoring-light fragment, warm dinner/table fragment, real stage/band light fragment, and a hint of real shuffleboard wood. These must behave as natural optical reflections/refractions inside curved wine, never as floating screens, collages or holograms. Keep any people extremely small/reflected so no new face or identity is invented.
2.65-4.00 sec: camera touches and passes THROUGH the physical liquid surface of the wine droplet. The surface wraps naturally around lens with macro surface tension and realistic refraction. We enter a deep burgundy/red-black liquid world and accelerate toward a small warm practical opening ahead. End while moving forward through this liquid space so editorial can hard-match directly into the authentic Churchill entrance in Scene 02.

AUTHENTICITY LOCK:
Use the supplied Churchill reference assets only as identity/geometry truth for any recognizable reflection. Preserve the real Churchill pool geometry, real modern electronic darts, real shuffleboard character, real dinner atmosphere and real band/stage identity. Do not generate a different venue. Do not create a generic luxury restaurant. Do not create a fake singer or clear new face. Do not show a traditional/sisal/bristle/cork dartboard. No futuristic rebuild, hologram UI, cyberpunk neon, fake signage, invented logo, words, captions or title cards.

BRAND RULE:
Do NOT show the Churchill 3D logo in this opening. The exact 3D logo is reserved for the final film payoff. Warm amber/orange may exist only as natural practical reflection and glass refraction.

CRAFT:
Extremely photographic macro cinematography, expensive lensing, restrained highlight rolloff, physically correct wine viscosity and refraction, fine-film contrast, premium black levels, no AI shimmer, no warping, no rubbery liquid, no fantasy particles, no glitter, no obvious CGI glow. The impossible part is only the camera entering the droplet; everything else should feel physically photographed.`;

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
  if (!data?.id) throw new Error("CHURCHILL_V5_GEMINI_CREDENTIAL_REQUIRED");
  return data.id;
}

async function patchScene(p, value) {
  const metadata = p.metadata || {};
  const current = metadata.churchill_v5_scenes || {};
  const next = {
    ...current,
    version: VERSION,
    public_line: "COME FOR DINNER. STAY FOR THE NIGHT.",
    concept: "THE NIGHT INSIDE THE NIGHT",
    scenes: {
      ...(current.scenes || {}),
      [SCENE_KEY]: value,
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
  return next;
}

async function start() {
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  if (current?.status === "COMPLETED" && current?.output_reference) {
    return { success: true, reused: true, scene: SCENE_KEY, state: current };
  }
  if (current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) {
    return { success: true, reused: true, scene: SCENE_KEY, state: current };
  }

  const credentialId = await activeGeminiCredentialId();
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
      primary_source_asset_id: ASSETS.dinner,
      source: ASSETS.dinner,
      selected_assets: [ASSETS.dinner],
      prompt: PROMPT,
      provider_prompt: PROMPT,
      media_duration_seconds: 4,
      duration_seconds: 4,
      output_spec: { duration_seconds: 4, aspect_ratio: "16:9" },
      generation: {
        model: MODEL,
        output_spec: { duration_seconds: 4, aspect_ratio: "16:9" },
      },
      provider_parameters: {
        aspect_ratio: "16:9",
        primary_source_asset_id: ASSETS.dinner,
      },
      creative_project_id: PROJECT_ID,
      creative_mission_id: p.creative_mission_id || null,
      credential_id: credentialId,
      quantity: 4,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: "CHURCHILL_V5_SCENE_01_THE_DROP",
      version: VERSION,
      creative_project_id: PROJECT_ID,
      scene_key: SCENE_KEY,
      authentic_reference_asset_ids: SELECTED_ASSETS,
      exact_3d_logo_reserved_for_epilogue: true,
      generated_venue_replacement_allowed: false,
      generated_people_allowed: false,
      traditional_dartboard_allowed: false,
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
    source_duration_seconds: 4,
    final_editorial_duration_seconds: 3.5,
    primary_source_asset_id: ASSETS.dinner,
    authentic_reference_asset_ids: SELECTED_ASSETS,
    output_reference: result?.pending
      ? null
      : (result?.output?.file_url ||
          result?.output?.video_url ||
          result?.output?.url ||
          result?.output?.raw?.output?.storage_reference ||
          null),
    exact_3d_logo_reserved_for_epilogue: true,
    visual_review_complete: false,
    approved_for_master: false,
    publication_authorized: false,
  };

  await patchScene(p, state);
  return { success: true, reused: false, scene: SCENE_KEY, state };
}

async function poll() {
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  if (!current) throw new Error("CHURCHILL_V5_SCENE_01_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) {
    return { success: true, pending: false, reused: true, scene: SCENE_KEY, state: current };
  }
  if (!current.provider_job_id || !current.usage_id) {
    throw new Error("CHURCHILL_V5_SCENE_01_PENDING_STATE_INCOMPLETE");
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
      operation: "CHURCHILL_V5_SCENE_01_THE_DROP_POLL",
      version: VERSION,
      creative_project_id: PROJECT_ID,
      scene_key: SCENE_KEY,
      publication_authorized: false,
    },
  });

  if (result?.failed) {
    const failed = {
      ...current,
      status: "FAILED",
      provider_status: result.provider_status || "failed",
      error: result.error || "Scene 01 generation failed",
      completed_at: new Date().toISOString(),
    };
    await patchScene(p, failed);
    return { success: false, failed: true, pending: false, scene: SCENE_KEY, state: failed };
  }

  if (result?.pending) {
    const pending = {
      ...current,
      status: "PROCESSING",
      provider_status: result.provider_status || "processing",
      last_polled_at: new Date().toISOString(),
    };
    await patchScene(p, pending);
    return { success: true, pending: true, scene: SCENE_KEY, state: pending };
  }

  const outputReference =
    result?.output?.file_url ||
    result?.output?.video_url ||
    result?.output?.url ||
    result?.output?.raw?.output?.storage_reference ||
    result?.output?.raw?.output?.file_url ||
    null;
  if (!outputReference) throw new Error("CHURCHILL_V5_SCENE_01_OUTPUT_REQUIRED");

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
  await patchScene(p, complete);
  return { success: true, pending: false, scene: SCENE_KEY, state: complete };
}

async function status() {
  const p = await project();
  return {
    success: true,
    version: VERSION,
    scene: SCENE_KEY,
    state:
      p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] ||
      { status: "NOT_STARTED" },
    policy: {
      final_editorial_duration_seconds: 3.5,
      exact_3d_logo_reserved_for_epilogue: true,
      authentic_churchill_reflections_only: true,
      visual_review_required: true,
      publication_authorized: false,
    },
  };
}

async function video() {
  const p = await project();
  const state = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  const ref = text(state?.output_reference);
  if (state?.status !== "COMPLETED" || !ref) {
    return json({ success: false, error: "SCENE_01_VIDEO_NOT_READY" }, 409);
  }

  if (ref.startsWith("storage://")) {
    const storagePath = ref.slice("storage://".length);
    const parts = storagePath.split("/").filter(Boolean);
    const bucket = parts.shift();
    const path = parts.join("/");
    if (!bucket || !path) throw new Error("CHURCHILL_V5_SCENE_01_STORAGE_REFERENCE_INVALID");
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error) throw error;
    const bytes = await data.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'inline; filename="churchill-v5-scene-01-the-drop.mp4"',
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (ref.startsWith("https://") || ref.startsWith("http://")) {
    const upstream = await fetch(ref, { cache: "no-store" });
    if (!upstream.ok) throw new Error(`CHURCHILL_V5_SCENE_01_UPSTREAM_${upstream.status}`);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Content-Disposition": 'inline; filename="churchill-v5-scene-01-the-drop.mp4"',
        "Cache-Control": "private, no-store",
      },
    });
  }

  throw new Error("CHURCHILL_V5_SCENE_01_OUTPUT_REFERENCE_UNSUPPORTED");
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "start") return json(await start());
    if (action === "poll") return json(await poll());
    if (action === "video") return await video();
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V5_SCENE_01_FAILED", {
      message: error?.message || String(error),
      details: error?.details || null,
    });
    return json(
      {
        success: false,
        error: error?.message || String(error),
        details: error?.details || null,
      },
      500,
    );
  }
}
