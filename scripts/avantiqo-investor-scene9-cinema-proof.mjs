import crypto from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://api.runpod.ai/v2";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
const PROOF_CONTRACT = "AVANTIQO_INVESTOR_SCENE9_CINEMA_PROOF_V1";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const INVESTOR_PROJECT_ID = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const CREATIVE_PROJECT_ID = "c75e5e5a-8e8a-4a3c-919f-2be943c2ec4c";
const SCENE = 9;
const BUCKET = "creative-assets";
const DURATION_SECONDS = 7;
const FPS = 8;
const ASPECT_RATIO = "16:9";
const RESOLUTION = "720p";
const POLL_INTERVAL_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 15000;
const MAX_WAIT_MS = Math.max(POLL_INTERVAL_MS, Number(process.env.INVESTOR_SCENE9_PROOF_TIMEOUT_MS || 60 * 60 * 1000));
const REQUEST_ID = String(process.env.INVESTOR_SCENE9_PROOF_REQUEST_ID || "scene9-owned-proof-v1").trim().replace(/[^A-Za-z0-9._-]/g, "");
const OUTPUT_PATH = process.env.INVESTOR_SCENE9_PROOF_RESULT || "/tmp/avantiqo-investor-scene9-cinema-proof.json";

const DESCRIPTION = [
  "Seven-second single-take premium investor-film shot in a refined busy restaurant at evening, human eye-level, approximately 35mm lens, slow controlled forward-and-sideways dolly.",
  "Foreground: a believable guest gives an order to a waiter during normal service.",
  "Midground: the waiter turns and passes the order toward an open kitchen; a cook reaches for an ingredient as stock is physically removed from a shelf or crate.",
  "Background/right: another staff member completes a contactless table payment or receipt handoff.",
  "As each real action happens, extremely subtle transparent warm-gold context traces appear attached to the real objects only: customer and order, staff and action, stock movement, payment movement.",
  "The traces are elegant light relationships, never interface panels. They remain spatially attached to the people and objects while the camera moves.",
  "Near the end, the four traces connect briefly into one thin organization-context line; that newly connected context immediately changes the next visible action as the waiter redirects and starts the correct next step.",
  "End on the physical business continuing smoothly as one understood reality, not on a graphic or software screen.",
  "Photorealistic people, realistic faces and hands, natural human timing, believable restaurant materials, warm practical lighting, layered depth, restrained luxury, cinematic depth of field, physically plausible reflections.",
  "The transparent intelligence treatment should feel like invisible business understanding revealed by light: subtle, premium and almost architectural, never science-fiction UI."
].join(" ");

const NEGATIVE_CONSTRAINTS = [
  "no software interface",
  "no browser",
  "no dashboard",
  "no app window",
  "no phone screen close-up",
  "no readable text",
  "no fake numbers",
  "no floating cards",
  "no logo wall",
  "no generic AI orb",
  "no robot",
  "no neon cyberpunk",
  "no distorted faces",
  "no malformed hands",
  "no duplicate people",
  "no surreal objects",
  "no subtitles",
  "no watermark",
  "no top-down camera angle"
];

function text(value) { return String(value ?? "").trim(); }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function terminalFailure(status) { return ["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(status); }
function errorDetail(body = {}) { const value = body?.error ?? body?.message ?? body?.output?.error; return typeof value === "object" ? JSON.stringify(value).slice(0, 1200) : text(value).slice(0, 1200); }

async function parseJsonResponse(response) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`RUNPOD_HTTP_${response.status}:${errorDetail(body) || text(raw).slice(0, 1200)}`);
  return body;
}

function progress(jobId, status, started, body = {}, reason = "STATUS") {
  const elapsedSeconds = Math.max(0, Math.round((performance.now() - started) / 1000));
  const delayMs = Number.isFinite(Number(body?.delayTime)) ? Math.round(Number(body.delayTime)) : null;
  const executionMs = Number.isFinite(Number(body?.executionTime)) ? Math.round(Number(body.executionTime)) : null;
  console.log(`AVANTIQO_INVESTOR_SCENE9_PROGRESS reason=${reason} job_id=${jobId} status=${status || "UNKNOWN"} elapsed_seconds=${elapsedSeconds} delay_ms=${delayMs ?? "unknown"} execution_ms=${executionMs ?? "unknown"}`);
}

const endpointId = required("RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID");
const apiKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || required("RUNPOD_API_KEY");
const supabaseUrl = text(process.env.NEXT_PUBLIC_SUPABASE_URL) || required("SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const model = text(process.env.AVANTIQO_VIDEO_T2V_MODEL) || "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

if (!REQUEST_ID) throw new Error("INVESTOR_SCENE9_PROOF_REQUEST_ID_REQUIRED");

const { data: project, error: projectError } = await supabase
  .from("creative_projects")
  .select("id,organization_id,creative_mission_id,metadata")
  .eq("id", CREATIVE_PROJECT_ID)
  .eq("organization_id", ORGANIZATION_ID)
  .maybeSingle();
if (projectError) throw projectError;
if (!project) throw new Error("INVESTOR_SCENE9_PROJECT_REQUIRED");
if (Number(project.metadata?.investor_scene) !== SCENE) throw new Error("INVESTOR_SCENE9_PROJECT_SCOPE_MISMATCH");

const idempotencyKey = `investor-scene9-cinema-proof:${REQUEST_ID}`;
let { data: generationJob, error: existingError } = await supabase
  .from("creative_generation_jobs")
  .select("*")
  .eq("organization_id", ORGANIZATION_ID)
  .eq("idempotency_key", idempotencyKey)
  .maybeSingle();
if (existingError) throw existingError;

if (generationJob && text(generationJob.status).toLowerCase() === "completed") {
  const result = {
    success: true,
    contract: PROOF_CONTRACT,
    status: "READY_FOR_REVIEW",
    duplicate_generation_prevented: true,
    generation_job_id: generationJob.id,
    provider_job_id: generationJob.provider_job_id || null,
    storage_reference: generationJob.output?.storage_reference || null,
    description: DESCRIPTION,
    production_certified: false,
    user_visual_approval_required: true
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (!generationJob) {
  const usageId = `investor-scene9-${crypto.randomUUID()}`;
  const storagePath = `${ORGANIZATION_ID}/${INVESTOR_PROJECT_ID}/scene9-owned-cinema-proof/${REQUEST_ID}.mp4`;
  const { data: upload, error: uploadError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath, { upsert: false });
  if (uploadError) throw uploadError;
  if (!upload?.signedUrl) throw new Error("INVESTOR_SCENE9_UPLOAD_URL_REQUIRED");
  const storageReference = `storage://${BUCKET}/${storagePath}`;

  const { data: claimed, error: claimError } = await supabase
    .from("creative_generation_jobs")
    .insert({
      organization_id: ORGANIZATION_ID,
      creative_mission_id: project.creative_mission_id || null,
      creative_project_id: CREATIVE_PROJECT_ID,
      generation_type: "investor_scene_cinema_proof",
      capability: "ai.video.generate",
      provider: "avantiqo-video",
      status: "processing",
      input: {
        contract: PROOF_CONTRACT,
        scene: SCENE,
        request_id: REQUEST_ID,
        duration_seconds: DURATION_SECONDS,
        fps: FPS,
        aspect_ratio: ASPECT_RATIO,
        resolution: RESOLUTION,
        foundation_model: model,
        storage_reference: storageReference,
        description: DESCRIPTION,
        negative_constraints: NEGATIVE_CONSTRAINTS
      },
      metadata: {
        investor_project_id: INVESTOR_PROJECT_ID,
        investor_scene: SCENE,
        owned_only_execution: true,
        external_ai_provider_used: false,
        external_ai_fallback_allowed: false,
        production_certified: false,
        user_visual_approval_required: true
      },
      idempotency_key: idempotencyKey,
      attempt_count: 1,
      max_attempts: 1,
      started_at: new Date().toISOString()
    })
    .select("*")
    .single();
  if (claimError) throw claimError;
  generationJob = claimed;

  console.log("AVANTIQO_INVESTOR_SCENE9_SUBMITTING=true");
  const submitResponse = await fetch(`${API_BASE}/${endpointId}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      input: {
        contract: ENGINE_CONTRACT,
        capability: "ai.video.generate",
        foundation_model: model,
        organization_id: ORGANIZATION_ID,
        organization_service_id: "investor-film-owned-preview",
        usage_id: usageId,
        instruction: DESCRIPTION,
        duration_seconds: DURATION_SECONDS,
        fps: FPS,
        aspect_ratio: ASPECT_RATIO,
        resolution: RESOLUTION,
        seed: 62909,
        quality_profile: "cinema",
        cinematic_control: {
          contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
          camera: {
            lens: "35mm human-eye-level commercial cinematography",
            movement: "slow controlled forward-and-sideways dolly through one continuous restaurant reality",
            framing: "layered foreground midground background, no overhead angle, no interface framing"
          },
          continuity: {
            single_business_reality: true,
            same_people_and_environment_across_entire_shot: true,
            context_traces_spatially_attached_to_real_actions: true,
            causal_end_action_required: true
          },
          frame_contract: {
            opening: "guest order begins in foreground",
            middle: "staff, stock and payment actions become causally connected",
            closing: "connected context changes the waiter's next physical action"
          },
          negative_constraints: NEGATIVE_CONSTRAINTS
        },
        storage_upload: { signed_url: upload.signedUrl, storage_reference: storageReference }
      }
    }),
    signal: AbortSignal.timeout(30000)
  });
  const submitted = await parseJsonResponse(submitResponse);
  const providerJobId = text(submitted?.id);
  if (!providerJobId) throw new Error(`INVESTOR_SCENE9_PROVIDER_JOB_ID_REQUIRED:${text(submitted?.status) || "UNKNOWN"}`);

  const { data: updated, error: updateError } = await supabase
    .from("creative_generation_jobs")
    .update({
      provider_job_id: providerJobId,
      provider_execution_id: providerJobId,
      status: text(submitted?.status).toUpperCase() === "COMPLETED" ? "completed" : "processing",
      output: { provider_job_id: providerJobId, storage_reference: storageReference, submission_status: text(submitted?.status).toUpperCase() },
      updated_at: new Date().toISOString()
    })
    .eq("id", generationJob.id)
    .eq("organization_id", ORGANIZATION_ID)
    .select("*")
    .single();
  if (updateError) throw updateError;
  generationJob = updated;
  console.log(`AVANTIQO_INVESTOR_SCENE9_JOB_SUBMITTED=${providerJobId}`);
}

const providerJobId = text(generationJob.provider_job_id);
if (!providerJobId) throw new Error("INVESTOR_SCENE9_PROVIDER_JOB_ID_MISSING_AFTER_CLAIM");

const started = performance.now();
const deadline = Date.now() + MAX_WAIT_MS;
let lastStatus = "";
let lastHeartbeatAt = 0;
let completedBody = null;
while (Date.now() < deadline) {
  const statusResponse = await fetch(`${API_BASE}/${endpointId}/status/${encodeURIComponent(providerJobId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000)
  });
  const body = await parseJsonResponse(statusResponse);
  const status = text(body?.status).toUpperCase();
  const now = Date.now();
  if (status !== lastStatus) {
    progress(providerJobId, status, started, body, "STATUS_CHANGE");
    lastStatus = status;
    lastHeartbeatAt = now;
  } else if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
    progress(providerJobId, status, started, body, "HEARTBEAT");
    lastHeartbeatAt = now;
  }
  if (status === "COMPLETED") { completedBody = body; break; }
  if (terminalFailure(status)) {
    const detail = errorDetail(body);
    await supabase.from("creative_generation_jobs").update({ status: "failed", failed_at: new Date().toISOString(), error_message: detail || status, updated_at: new Date().toISOString() }).eq("id", generationJob.id).eq("organization_id", ORGANIZATION_ID);
    throw new Error(`INVESTOR_SCENE9_RUNPOD_${status}:${detail}`);
  }
  await sleep(POLL_INTERVAL_MS);
}
if (!completedBody) throw new Error(`INVESTOR_SCENE9_WAIT_TIMEOUT_RESUMABLE:${providerJobId}:${MAX_WAIT_MS}`);

const output = completedBody.output || {};
const storageReference = text(output.storage_reference) || generationJob.output?.storage_reference || null;
const passed =
  text(output.provider) === "avantiqo-video" &&
  text(output.capability) === "ai.video.generate" &&
  text(output.foundation_model) === model &&
  Number(output.duration_seconds) === DURATION_SECONDS &&
  Number(output.fps) === FPS &&
  Number(output.width) === 1280 &&
  Number(output.height) === 704 &&
  Number(output.frame_count) >= 49 &&
  Number(output.size_bytes) > 10000 &&
  output.raw_reasoning_persisted === false;

const result = {
  success: passed,
  contract: PROOF_CONTRACT,
  status: passed ? "READY_FOR_REVIEW" : "MECHANICAL_PROOF_FAILED",
  organization_id: ORGANIZATION_ID,
  investor_project_id: INVESTOR_PROJECT_ID,
  creative_project_id: CREATIVE_PROJECT_ID,
  generation_job_id: generationJob.id,
  provider_job_id: providerJobId,
  provider: "avantiqo-video",
  foundation_model: model,
  duration_seconds: Number(output.duration_seconds) || null,
  fps: Number(output.fps) || null,
  frame_count: Number(output.frame_count) || null,
  width: Number(output.width) || null,
  height: Number(output.height) || null,
  size_bytes: Number(output.size_bytes) || null,
  generation_seconds: Number(output.generation_seconds) || null,
  storage_reference: storageReference,
  description: DESCRIPTION,
  negative_constraints: NEGATIVE_CONSTRAINTS,
  external_ai_provider_used: false,
  production_certified: false,
  user_visual_approval_required: true
};

await supabase.from("creative_generation_jobs").update({
  status: passed ? "completed" : "failed",
  completed_at: passed ? new Date().toISOString() : null,
  failed_at: passed ? null : new Date().toISOString(),
  error_message: passed ? null : "MECHANICAL_PROOF_FAILED",
  output: {
    provider_job_id: providerJobId,
    storage_reference: storageReference,
    review_status: passed ? "READY_FOR_REVIEW" : "FAILED",
    approved: false,
    engine_output: {
      provider: output.provider || null,
      capability: output.capability || null,
      foundation_model: output.foundation_model || null,
      duration_seconds: output.duration_seconds || null,
      fps: output.fps || null,
      frame_count: output.frame_count || null,
      width: output.width || null,
      height: output.height || null,
      size_bytes: output.size_bytes || null,
      generation_seconds: output.generation_seconds || null,
      raw_reasoning_persisted: output.raw_reasoning_persisted === false ? false : null
    }
  },
  updated_at: new Date().toISOString()
}).eq("id", generationJob.id).eq("organization_id", ORGANIZATION_ID);

await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (!passed) process.exitCode = 2;
