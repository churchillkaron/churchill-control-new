export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-v5-scene01-plate-20260822";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const SOURCE_ASSET_ID = "8b4854e6-8c9c-4fc6-a3f5-7eaadc1d8d8b";
const VERSION = "CHURCHILL_STAY_FOR_THE_NIGHT_V5_SCENE01_PLATE_R2";
const SCENE_KEY = "scene_01_the_drop_plate_r2";

const PROMPT = `Create a photoreal 4-second 16:9 luxury commercial VFX plate inspired by the supplied authentic Churchill dinner atmosphere.

SCENE: THE DROP.
0.00-0.45: near-black. A tiny warm practical reflection begins to reveal itself. No text and no logo.
0.45-1.55: one physically realistic suspended red-wine droplet emerges in extreme macro against black. Deep burgundy liquid, premium warm amber practical reflections, elegant shallow depth of field, controlled camera push toward the droplet.
1.55-2.65: camera approaches until the wine droplet dominates frame. The curved surface carries several tiny dark warm reflective windows and abstract distorted hospitality reflections. Keep these reflections impressionistic and optically plausible, NOT recognizable invented rooms, people, logos, pool tables, dartboards, stages or screens. They will receive authentic Churchill reflection inserts in editorial. Do not invent venue geometry or identities.
2.65-4.00: camera touches and passes THROUGH the physical wine surface. Realistic surface tension wraps around the lens. Enter a deep burgundy/red-black liquid world and accelerate toward one small warm practical opening ahead. End still moving forward, ready to hard-match into authentic Churchill entrance footage.

CRAFT: high-budget spirits/perfume/automotive cinema language; physically correct wine viscosity and refraction; restrained highlight rolloff; premium black levels; fine-film contrast; realistic macro lens behavior. No fantasy particles, glitter, holograms, cyberpunk, neon redesign, fake signage, captions, title cards, 3D logo, obvious CGI glow, AI shimmer, warping, rubbery liquid or generated people. The exact Churchill 3D logo is reserved for the final film payoff.`;

function text(value) { return String(value ?? "").trim(); }
function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
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

async function credentialId() {
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

async function patchState(p, state) {
  const metadata = p.metadata || {};
  const current = metadata.churchill_v5_scenes || {};
  const next = {
    ...current,
    version: VERSION,
    public_line: "COME FOR DINNER. STAY FOR THE NIGHT.",
    concept: "THE NIGHT INSIDE THE NIGHT",
    scenes: { ...(current.scenes || {}), [SCENE_KEY]: state },
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("creative_projects")
    .update({ metadata: { ...metadata, churchill_v5_scenes: next }, updated_at: new Date().toISOString() })
    .eq("id", PROJECT_ID)
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

async function start() {
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  if (current?.status === "COMPLETED" && current?.output_reference) return { success: true, reused: true, state: current };
  if (current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) return { success: true, reused: true, state: current };

  const cred = await credentialId();
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: {
      model: MODEL,
      primary_source_asset_id: SOURCE_ASSET_ID,
      source: SOURCE_ASSET_ID,
      selected_assets: [SOURCE_ASSET_ID],
      prompt: PROMPT,
      provider_prompt: PROMPT,
      media_duration_seconds: 4,
      duration_seconds: 4,
      output_spec: { duration_seconds: 4, aspect_ratio: "16:9" },
      generation: { model: MODEL, output_spec: { duration_seconds: 4, aspect_ratio: "16:9" } },
      provider_parameters: { aspect_ratio: "16:9", primary_source_asset_id: SOURCE_ASSET_ID },
      creative_project_id: PROJECT_ID,
      creative_mission_id: p.creative_mission_id || null,
      credential_id: cred,
      quantity: 4,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: "CHURCHILL_V5_SCENE01_DROP_PLATE_R2",
      version: VERSION,
      creative_project_id: PROJECT_ID,
      scene_key: SCENE_KEY,
      primary_source_asset_id: SOURCE_ASSET_ID,
      authentic_reflections_added_in_editorial: true,
      exact_3d_logo_reserved_for_epilogue: true,
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
    credential_id: result?.credential_id || cred,
    pricing: result?.pricing || null,
    started_at: result?.started_at || new Date().toISOString(),
    source_duration_seconds: 4,
    final_editorial_duration_seconds: 3.5,
    primary_source_asset_id: SOURCE_ASSET_ID,
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || null),
    authentic_reflections_added_in_editorial: true,
    visual_review_complete: false,
    approved_for_master: false,
    publication_authorized: false,
  };
  await patchState(p, state);
  return { success: true, reused: false, state };
}

async function poll() {
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  if (!current) throw new Error("CHURCHILL_V5_SCENE01_PLATE_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) return { success: true, pending: false, reused: true, state: current };
  if (!current.provider_job_id || !current.usage_id) throw new Error("CHURCHILL_V5_SCENE01_PLATE_PENDING_STATE_INCOMPLETE");

  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: current.provider || PROVIDER,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: { model: current.model || MODEL, creative_project_id: PROJECT_ID, creative_mission_id: p.creative_mission_id || null },
    metadata: { module: "CREATIVE", operation: "CHURCHILL_V5_SCENE01_DROP_PLATE_R2_POLL", version: VERSION, creative_project_id: PROJECT_ID, scene_key: SCENE_KEY, publication_authorized: false },
  });

  if (result?.failed) {
    const state = { ...current, status: "FAILED", provider_status: result.provider_status || "failed", error: result.error || "Scene 01 plate generation failed", completed_at: new Date().toISOString() };
    await patchState(p, state);
    return { success: false, failed: true, pending: false, state };
  }
  if (result?.pending) {
    const state = { ...current, status: "PROCESSING", provider_status: result.provider_status || "processing", last_polled_at: new Date().toISOString() };
    await patchState(p, state);
    return { success: true, pending: true, state };
  }

  const outputReference = result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || result?.output?.raw?.output?.file_url || null;
  if (!outputReference) throw new Error("CHURCHILL_V5_SCENE01_PLATE_OUTPUT_REQUIRED");
  const state = { ...current, status: "COMPLETED", provider_status: result.provider_status || "completed", settlement: result.settlement || null, pricing: result.pricing || current.pricing || null, output_reference: outputReference, completed_at: new Date().toISOString(), error: null };
  await patchState(p, state);
  return { success: true, pending: false, state };
}

async function status() {
  const p = await project();
  return { success: true, version: VERSION, scene: SCENE_KEY, state: p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || { status: "NOT_STARTED" }, policy: { exact_3d_logo_reserved_for_epilogue: true, authentic_reflections_added_in_editorial: true, visual_review_required: true, publication_authorized: false } };
}

async function video() {
  const p = await project();
  const state = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  const ref = text(state?.output_reference);
  if (state?.status !== "COMPLETED" || !ref) return json({ success: false, error: "SCENE_01_VIDEO_NOT_READY" }, 409);
  if (ref.startsWith("storage://")) {
    const parts = ref.slice(10).split("/").filter(Boolean);
    const bucket = parts.shift();
    const path = parts.join("/");
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error) throw error;
    return new Response(await data.arrayBuffer(), { status: 200, headers: { "Content-Type": "video/mp4", "Content-Disposition": 'inline; filename="churchill-v5-scene01-drop-plate.mp4"', "Cache-Control": "private, no-store" } });
  }
  if (/^https?:\/\//.test(ref)) {
    const upstream = await fetch(ref, { cache: "no-store" });
    if (!upstream.ok) throw new Error(`CHURCHILL_V5_SCENE01_UPSTREAM_${upstream.status}`);
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": upstream.headers.get("content-type") || "video/mp4", "Content-Disposition": 'inline; filename="churchill-v5-scene01-drop-plate.mp4"', "Cache-Control": "private, no-store" } });
  }
  throw new Error("CHURCHILL_V5_SCENE01_OUTPUT_REFERENCE_UNSUPPORTED");
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
    console.error("CHURCHILL_V5_SCENE01_PLATE_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
