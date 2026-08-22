export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { executeService, settlePendingService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-stay-night-v5-scene-02-20260822";
const PROVIDER = "gemini";
const MODEL = "gemini-omni-flash-preview";
const VERSION = "CHURCHILL_STAY_FOR_THE_NIGHT_V5_SCENE_02_ENTRANCE";
const SCENE_KEY = "scene_02_entrance_into_night";
const ENTRANCE_VIDEO = "d4dbb4f5-c2b8-41f9-87db-6cbc2f9a4a65";
const ENTRANCE_IMAGE = "f0c96f1a-6719-4dc2-8b9a-d095864d273a";

const PROMPT = `Create a single photoreal 5-second 16:9 luxury hospitality-commercial shot for the REAL Churchill Restaurant & Bar entrance in Karon, Phuket.

SCENE 02: ENTRANCE INTO THE NIGHT.
This shot follows immediately after Scene 01 THE DROP, where camera travels through a physical red-wine droplet and exits toward one small warm practical opening.

Use the supplied authentic Churchill entrance photograph as the PRIMARY generation plate and identity/geometry truth. The production also holds an authentic Churchill entrance video as motion and geometry reference evidence, but do not invent anything not visible in the supplied entrance plate. Preserve the real architecture, doorway, red carpet, plants, stanchions, exterior materials, proportions and actual Churchill character. Do NOT redesign or replace the venue.

TIMING / CAMERA:
0.00-0.45 sec: begin inside a deep burgundy-black optical field matching the previous wine-drop ending. One warm practical opening grows naturally ahead. No title, no logo overlay.
0.45-1.10 sec: the burgundy refraction clears as if camera exits through liquid/glass. The REAL Churchill entrance resolves directly from the supplied source, maintaining authentic geometry and perspective.
1.10-4.35 sec: one elegant stabilized forward move toward and through the real entrance. Camera height approximately human chest/eye level, premium dolly/gimbal feel, no drone movement. Preserve real warm practical lighting. Add only restrained physically plausible amber/orange reflections catching glass, metal, polished edges and wood, as the first subtle trace of the Churchill Pulse motif. This is natural light/reflection, never a sci-fi beam.
4.35-5.00 sec: finish crossing the threshold with a clean dark-warm interior direction that can hard-match into Scene 03 dinner reflections.

AUTHENTICITY LOCK:
The supplied real entrance is mandatory. No generated replacement restaurant, no generic hotel entrance, no invented building, no geometry changes, no fake people, no generated faces, no vehicles added, no neon redesign, no futuristic treatment. Do not invent or rewrite any signage. Existing sign/text visible in the source must remain photographic/source-faithful and should not be emphasized or regenerated. If text cannot be preserved perfectly, frame/light it naturally rather than creating new letters.

CRAFT:
High-budget automotive/perfume/spirits commercial language. Deep blacks, restrained warm highlights, fine-film contrast, realistic lens bloom only from actual practical lights, clean motion, physically believable reflections, no AI shimmer, no warping, no rubber surfaces, no fantasy particles, no floating graphics, no captions, no title cards. The scene must feel like a real camera entering Churchill at night.`;

function text(value) { return String(value ?? "").trim(); }
function json(data, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } }); }

async function project() {
  const { data, error } = await supabaseAdmin.from("creative_projects").select("*").eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V5_PROJECT_NOT_FOUND");
  return data;
}

async function credentialId() {
  const { data, error } = await supabaseAdmin.from("provider_credentials").select("id").eq("provider_id", PROVIDER).eq("status", "ACTIVE").order("created_at", { ascending: false }).limit(1).maybeSingle();
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
    scenes: { ...(current.scenes || {}), [SCENE_KEY]: value },
    story_change_authorized: true,
    publication_authorized: false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("creative_projects").update({ metadata: { ...metadata, churchill_v5_scenes: next }, updated_at: new Date().toISOString() }).eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
}

async function start() {
  const p = await project();
  const current = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  if (current?.status === "COMPLETED" && current?.output_reference) return { success: true, reused: true, scene: SCENE_KEY, state: current };
  if (current?.status === "PROCESSING" && current?.provider_job_id && current?.usage_id) return { success: true, reused: true, scene: SCENE_KEY, state: current };

  const cred = await credentialId();
  const result = await executeService({
    organization_id: ORGANIZATION_ID,
    bill_to_organization_id: ORGANIZATION_ID,
    service_id: "ai.video.generate",
    provider_id: PROVIDER,
    provider_policy: { allowed_providers: [PROVIDER], preferred_providers: [PROVIDER] },
    input: {
      model: MODEL,
      primary_source_asset_id: ENTRANCE_IMAGE,
      source: ENTRANCE_IMAGE,
      selected_assets: [ENTRANCE_IMAGE],
      prompt: PROMPT,
      provider_prompt: PROMPT,
      media_duration_seconds: 5,
      duration_seconds: 5,
      output_spec: { duration_seconds: 5, aspect_ratio: "16:9" },
      generation: { model: MODEL, output_spec: { duration_seconds: 5, aspect_ratio: "16:9" } },
      provider_parameters: { aspect_ratio: "16:9", primary_source_asset_id: ENTRANCE_IMAGE },
      creative_project_id: PROJECT_ID,
      creative_mission_id: p.creative_mission_id || null,
      credential_id: cred,
      quantity: 5,
      currency: "THB",
    },
    metadata: {
      module: "CREATIVE",
      operation: "CHURCHILL_V5_SCENE_02_ENTRANCE",
      version: VERSION,
      creative_project_id: PROJECT_ID,
      scene_key: SCENE_KEY,
      primary_source_asset_id: ENTRANCE_IMAGE,
      motion_reference_asset_id: ENTRANCE_VIDEO,
      authentic_reference_asset_ids: [ENTRANCE_IMAGE, ENTRANCE_VIDEO],
      generated_venue_replacement_allowed: false,
      generated_people_allowed: false,
      signage_rewrite_allowed: false,
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
    source_duration_seconds: 5,
    final_editorial_duration_seconds: 5,
    primary_source_asset_id: ENTRANCE_IMAGE,
    motion_reference_asset_id: ENTRANCE_VIDEO,
    authentic_reference_asset_ids: [ENTRANCE_IMAGE, ENTRANCE_VIDEO],
    output_reference: result?.pending ? null : (result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || null),
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
  if (!current) throw new Error("CHURCHILL_V5_SCENE_02_NOT_STARTED");
  if (current.status === "COMPLETED" && current.output_reference) return { success: true, pending: false, reused: true, scene: SCENE_KEY, state: current };
  if (!current.provider_job_id || !current.usage_id) throw new Error("CHURCHILL_V5_SCENE_02_PENDING_STATE_INCOMPLETE");

  const result = await settlePendingService({
    organization_id: ORGANIZATION_ID,
    provider: current.provider || PROVIDER,
    provider_job_id: current.provider_job_id,
    usage_id: current.usage_id,
    pricing: current.pricing || {},
    credential_id: current.credential_id || null,
    started_at: current.started_at || null,
    provider_status_input: { model: current.model || MODEL, creative_project_id: PROJECT_ID, creative_mission_id: p.creative_mission_id || null },
    metadata: { module: "CREATIVE", operation: "CHURCHILL_V5_SCENE_02_ENTRANCE_POLL", version: VERSION, creative_project_id: PROJECT_ID, scene_key: SCENE_KEY, publication_authorized: false },
  });

  if (result?.failed) {
    const failed = { ...current, status: "FAILED", provider_status: result.provider_status || "failed", error: result.error || "Scene 02 generation failed", completed_at: new Date().toISOString() };
    await patchScene(p, failed);
    return { success: false, failed: true, pending: false, scene: SCENE_KEY, state: failed };
  }
  if (result?.pending) {
    const pending = { ...current, status: "PROCESSING", provider_status: result.provider_status || "processing", last_polled_at: new Date().toISOString() };
    await patchScene(p, pending);
    return { success: true, pending: true, scene: SCENE_KEY, state: pending };
  }

  const outputReference = result?.output?.file_url || result?.output?.video_url || result?.output?.url || result?.output?.raw?.output?.storage_reference || result?.output?.raw?.output?.file_url || null;
  if (!outputReference) throw new Error("CHURCHILL_V5_SCENE_02_OUTPUT_REQUIRED");
  const complete = { ...current, status: "COMPLETED", provider_status: result.provider_status || "completed", settlement: result.settlement || null, pricing: result.pricing || current.pricing || null, output_reference: outputReference, completed_at: new Date().toISOString(), error: null };
  await patchScene(p, complete);
  return { success: true, pending: false, scene: SCENE_KEY, state: complete };
}

async function status() {
  const p = await project();
  return { success: true, version: VERSION, scene: SCENE_KEY, state: p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || { status: "NOT_STARTED" }, policy: { authentic_churchill_entrance_required: true, signage_rewrite_allowed: false, visual_review_required: true, publication_authorized: false } };
}

async function video() {
  const p = await project();
  const state = p.metadata?.churchill_v5_scenes?.scenes?.[SCENE_KEY] || null;
  const ref = text(state?.output_reference);
  if (state?.status !== "COMPLETED" || !ref) return json({ success: false, error: "SCENE_02_VIDEO_NOT_READY" }, 409);
  if (ref.startsWith("storage://")) {
    const parts = ref.slice("storage://".length).split("/").filter(Boolean);
    const bucket = parts.shift();
    const path = parts.join("/");
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
    if (error) throw error;
    return new Response(await data.arrayBuffer(), { status: 200, headers: { "Content-Type": "video/mp4", "Content-Disposition": 'inline; filename="churchill-v5-scene-02-entrance.mp4"', "Cache-Control": "private, no-store" } });
  }
  if (/^https?:\/\//.test(ref)) {
    const upstream = await fetch(ref, { cache: "no-store" });
    if (!upstream.ok) throw new Error(`CHURCHILL_V5_SCENE_02_UPSTREAM_${upstream.status}`);
    return new Response(upstream.body, { status: 200, headers: { "Content-Type": upstream.headers.get("content-type") || "video/mp4", "Content-Disposition": 'inline; filename="churchill-v5-scene-02-entrance.mp4"', "Cache-Control": "private, no-store" } });
  }
  throw new Error("CHURCHILL_V5_SCENE_02_OUTPUT_REFERENCE_UNSUPPORTED");
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
    console.error("CHURCHILL_V5_SCENE_02_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
