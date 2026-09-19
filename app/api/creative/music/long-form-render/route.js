export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto, { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { getPublicSupabaseUrl } from "@/lib/shared/supabase/publicConfig";
import { buildMusicReleaseRenderPlan } from "@/lib/creative/music/runtime/CreativeMusicReleaseRenderPlanRuntime";
import { buildAudioPostLanguageSession } from "@/lib/creative/music/runtime/CreativeAudioPostVersionRuntime";
import { buildProfessionalAudioLongFormRenderPlan } from "@/lib/creative/music/runtime/CreativeProfessionalAudioLongFormRenderPlanRuntime";
import {
  buildProfessionalAudioLongFormWorkerEnvelope,
  inspectProfessionalAudioLongFormWorker,
  pollProfessionalAudioLongFormWorkerJob,
  submitProfessionalAudioLongFormWorkerJob,
} from "@/lib/creative/music/runtime/CreativeProfessionalAudioLongFormWorkerRuntime";
import {
  directStorageHostname,
  planProfessionalAudioLongFormStorage,
  tusUploadMetadata,
} from "@/lib/creative/music/runtime/CreativeProfessionalAudioLongFormStorageRuntime";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const KEY = "music_multitrack_project";
const JOBS_KEY = "audio_long_form_render_jobs";
const BUCKET = "creative-assets";
const MAX_JOBS = 40;

function text(value) { return String(value ?? "").trim(); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
function fingerprint(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function workerToken() { return text(process.env.AVANTIQO_AUDIO_LONG_FORM_WORKER_TOKEN); }
function workerAuthorized(request) { const token = workerToken(); return Boolean(token) && request.headers.get("authorization") === `Bearer ${token}`; }
function jobs(project) { return Array.isArray(project.metadata?.[JOBS_KEY]) ? project.metadata[JOBS_KEY] : []; }
function findJob(project, jobHash, jobId = null) {
  return [...jobs(project)].reverse().find((entry) => entry.job_hash === jobHash && (!jobId || !entry.job_id || entry.job_id === jobId)) || null;
}
function replaceJob(project, jobHash, patch) {
  const current = jobs(project), index = current.findIndex((entry) => entry.job_hash === jobHash);
  const next = index >= 0 ? current.map((entry, i) => i === index ? { ...entry, ...patch } : entry) : [...current, { job_hash: jobHash, ...patch }];
  return next.slice(-MAX_JOBS);
}
async function persistJob(project, jobHash, patch) {
  const nextJobs = replaceJob(project, jobHash, patch);
  const metadata = { ...(project.metadata || {}), [JOBS_KEY]: nextJobs, audio_long_form_render_updated_at: new Date().toISOString() };
  await CreativeProjectRepository.update(project.id, { metadata });
  project.metadata = metadata;
  return nextJobs.find((entry) => entry.job_hash === jobHash);
}
function sessionAssetIds(session = {}) {
  return new Set((session.tracks || []).flatMap((track) => (track.clips || []).filter((clip) => clip?.muted !== true).map((clip) => text(clip.source_asset_id))).filter(Boolean));
}
async function resolveAssetUrls(organizationId, projectId, session) {
  const ids = sessionAssetIds(session);
  if (!ids.size) return {};
  const assets = await CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: Math.max(200, ids.size * 2) });
  const urls = {};
  for (const asset of assets) {
    const id = text(asset?.id || asset?.asset_id);
    if (!ids.has(id)) continue;
    const source = text(asset?.file_url || asset?.url);
    if (source) urls[id] = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: source });
  }
  for (const id of ids) if (!urls[id]) throw new Error(`CREATIVE_AUDIO_LONG_FORM_SOURCE_URL_MISSING:${id}`);
  return urls;
}
async function scopedProject(organizationId, projectId) {
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) throw new Error("CREATIVE_AUDIO_LONG_FORM_PROJECT_NOT_FOUND");
  return project;
}
function buildState(project, body) {
  const base = project.metadata?.[KEY];
  if (!base) throw new Error("CREATIVE_AUDIO_LONG_FORM_SESSION_REQUIRED");
  const session = body.delivery_language ? buildAudioPostLanguageSession(base, body.delivery_language) : base;
  const releasePlan = buildMusicReleaseRenderPlan(session, body.options || {});
  const graphFingerprint = fingerprint({ session, releasePlan });
  const longFormPlan = buildProfessionalAudioLongFormRenderPlan({ session, release_plan: releasePlan, graph_fingerprint: graphFingerprint, chunk_seconds: body.chunk_seconds });
  return { session, releasePlan, graphFingerprint, longFormPlan };
}
async function workerPrepareUpload(request, body) {
  if (!workerAuthorized(request)) return NextResponse.json({ success: false, error: "LONG_FORM_WORKER_UNAUTHORIZED" }, { status: 401 });
  const organizationId = text(body.organization_id), projectId = text(body.creative_project_id), jobHash = text(body.job_hash), jobId = text(body.job_id);
  const sizeBytes = Math.max(1, Math.round(Number(body.size_bytes) || 0)), checksum = text(body.sha256);
  if (!organizationId || !projectId || !jobHash || !jobId || !checksum) throw new Error("CREATIVE_AUDIO_LONG_FORM_UPLOAD_IDENTITY_REQUIRED");
  const project = await scopedProject(organizationId, projectId), job = findJob(project, jobHash, jobId);
  if (!job || !["SUBMITTED", "RUNNING", "UPLOADING"].includes(job.status)) throw new Error("CREATIVE_AUDIO_LONG_FORM_JOB_NOT_AUTHORIZED");
  if (job.project_revision !== project.metadata?.[KEY]?.revision) throw new Error("CREATIVE_AUDIO_LONG_FORM_JOB_STALE");
  const storage = planProfessionalAudioLongFormStorage({ size_bytes: sizeBytes });
  const objectName = `${organizationId}/derived/music-long-form/${projectId}/r${job.project_revision}/${jobHash.slice(0, 16)}-${randomUUID()}-long-form-premaster.wav`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(objectName, { upsert: false });
  if (error) throw error;
  if (!data?.token) throw new Error("CREATIVE_AUDIO_LONG_FORM_SIGNED_UPLOAD_TOKEN_REQUIRED");
  const projectUrl = getPublicSupabaseUrl(), directOrigin = directStorageHostname(projectUrl);
  const upload = {
    contract: "AVANTIQO_AUDIO_LONG_FORM_UPLOAD_AUTHORIZATION_V1",
    transport: storage.transport,
    bucket_name: BUCKET,
    object_name: objectName,
    storage_reference: `storage://${BUCKET}/${objectName}`,
    signed_upload_url: data.signedUrl,
    signed_upload_token: data.token,
    tus_endpoint: `${directOrigin}/storage/v1/upload/resumable`,
    tus_chunk_bytes: storage.tus_chunk_bytes,
    tus_metadata: tusUploadMetadata({ bucket_name: BUCKET, object_name: objectName, content_type: "audio/wav" }),
    size_bytes: sizeBytes,
    sha256: checksum,
    authorized_at: new Date().toISOString(),
  };
  await persistJob(project, jobHash, { job_id: jobId, status: "UPLOADING", progress_percent: 95, upload });
  return NextResponse.json({ success: true, upload, provider_job_submitted: false, endpoint_mutation_performed: true }, { headers: { "Cache-Control": "no-store" } });
}
async function workerFinalize(request, body) {
  if (!workerAuthorized(request)) return NextResponse.json({ success: false, error: "LONG_FORM_WORKER_UNAUTHORIZED" }, { status: 401 });
  const organizationId = text(body.organization_id), projectId = text(body.creative_project_id), jobHash = text(body.job_hash), jobId = text(body.job_id), storageReference = text(body.storage_reference), checksum = text(body.sha256);
  const project = await scopedProject(organizationId, projectId), job = findJob(project, jobHash, jobId);
  if (!job?.upload || job.upload.storage_reference !== storageReference || job.upload.sha256 !== checksum) throw new Error("CREATIVE_AUDIO_LONG_FORM_FINALIZE_EVIDENCE_MISMATCH");
  const supabase = getServiceSupabase();
  const { data: info, error } = await supabase.storage.from(BUCKET).info(job.upload.object_name);
  if (error) throw error;
  const observedBytes = Number(info?.metadata?.size ?? info?.size ?? 0);
  if (observedBytes && observedBytes !== Number(job.upload.size_bytes)) throw new Error("CREATIVE_AUDIO_LONG_FORM_STORAGE_SIZE_MISMATCH");
  const asset = await CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: project.creative_mission_id || null,
    asset_type: "AUDIO",
    file_url: storageReference,
    file_name: `${text(project.name || project.title || "audio").replace(/[^A-Za-z0-9._-]+/g, "-")}-long-form-premaster.wav`,
    name: `${project.name || project.title || "Audio"} — Long-form Pre-master`,
    title: `${project.name || project.title || "Audio"} — Long-form Pre-master`,
    description: "Owned Chrome-parity long-form float RF64 pre-master assembled from sample-exact context-rendered chunks. Final whole-program mastering remains required.",
    ai_generated: false,
    provider: "avantiqo-local-audio-long-form-worker",
    engine: "AVANTIQO_MUSIC_WORKSTATION_GRAPH_PARITY_V1",
    prompt: null,
    metadata: {
      media_kind: "MUSIC",
      mime_type: "audio/wav",
      music_asset_kind: "LONG_FORM_PREMASTER",
      project_revision: job.project_revision,
      delivery_profile_id: job.delivery_profile_id || null,
      delivery_language: job.delivery_language || null,
      picture_lock_digest: job.picture_lock_digest || null,
      graph_fingerprint: job.graph_fingerprint,
      long_form_plan_hash: job.plan_hash,
      long_form_job_id: jobId,
      long_form_job_hash: jobHash,
      sample_rate: job.sample_rate,
      channels: job.channels,
      channel_layout: job.channel_layout,
      bit_depth: 32,
      pcm_format: "float32",
      rf64: true,
      assembled_size_bytes: job.upload.size_bytes,
      sha256: checksum,
      source_assets_preserved: true,
      release_candidate: false,
      final_mastering_required: true,
      whole_program_qc_required: true,
      derived_asset: true,
      destructive_edit: false,
      rendered_at: new Date().toISOString(),
    },
    tags: ["music", "audio-post", "long-form", "premaster", "rf64", "float32"],
  });
  await persistJob(project, jobHash, { job_id: jobId, status: "COMPLETED", progress_percent: 100, asset_id: asset.id, storage_reference: storageReference, sha256: checksum, completed_at: new Date().toISOString() });
  return NextResponse.json({ success: true, asset_id: asset.id, storage_reference: storageReference, sha256: checksum, final_mastering_required: true, provider_job_submitted: false, endpoint_mutation_performed: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request) {
  try {
    const body = await request.json(), action = text(body.action || "plan").toLowerCase();
    if (action === "worker_prepare_upload") return workerPrepareUpload(request, body);
    if (action === "worker_finalize") return workerFinalize(request, body);

    const organizationId = text(body.organization_id), projectId = text(body.creative_project_id);
    if (!organizationId || !projectId) return NextResponse.json({ success: false, error: "organization_id and creative_project_id required" }, { status: 400 });
    const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
    if (!access.success) return NextResponse.json({ success: false, error: access.error || "forbidden" }, { status: access.status || 403 });
    const project = await scopedProject(organizationId, projectId), { session, releasePlan, graphFingerprint, longFormPlan } = buildState(project, body), worker = inspectProfessionalAudioLongFormWorker();

    if (action === "start") {
      if (!releasePlan.long_form_delivery?.server_render_required) throw new Error("CREATIVE_AUDIO_LONG_FORM_SERVER_RENDER_NOT_REQUIRED");
      const nonLongFormBlockers = (releasePlan.readiness?.blockers || []).filter((item) => item.code !== "LONG_FORM_SERVER_RENDER_REQUIRED");
      if (nonLongFormBlockers.length) throw new Error(`CREATIVE_AUDIO_LONG_FORM_RENDER_BLOCKED:${nonLongFormBlockers.map((item) => item.code).join(",")}`);
      if (!worker.ready) return NextResponse.json({ success: false, error: worker.blocking_reason, worker, long_form_plan: longFormPlan, provider_job_submitted: false, endpoint_mutation_performed: false }, { status: 409, headers: { "Cache-Control": "no-store" } });
      const assetUrls = await resolveAssetUrls(organizationId, projectId, session);
      const envelope = buildProfessionalAudioLongFormWorkerEnvelope({ organization_id: organizationId, creative_project_id: projectId, plan: longFormPlan, graph_fingerprint: graphFingerprint, session_snapshot: session, asset_urls: assetUrls });
      await persistJob(project, envelope.job_hash, {
        contract: "AVANTIQO_AUDIO_LONG_FORM_JOB_AUTHORIZATION_V1",
        job_id: null,
        job_hash: envelope.job_hash,
        plan_hash: longFormPlan.plan_hash,
        graph_fingerprint: graphFingerprint,
        project_revision: releasePlan.project_revision,
        delivery_profile_id: releasePlan.delivery_profile?.id || null,
        delivery_language: session.delivery_language || null,
        picture_lock_digest: session.picture_lock?.picture_lock_digest || null,
        sample_rate: releasePlan.sample_rate,
        channels: releasePlan.channels,
        channel_layout: releasePlan.channel_layout,
        status: "AUTHORIZED",
        progress_percent: 0,
        authorized_by_user_id: access.user_id || access.user?.id || null,
        authorized_at: new Date().toISOString(),
      });
      const submission = await submitProfessionalAudioLongFormWorkerJob({ envelope });
      await persistJob(project, envelope.job_hash, { job_id: submission.job_id, status: "SUBMITTED", progress_percent: 0, submitted_at: new Date().toISOString() });
      return NextResponse.json({ success: true, worker, long_form_plan: longFormPlan, job_id: submission.job_id, job_hash: submission.job_hash, pending: submission.pending, worker_response: submission.response, provider_job_submitted: false, endpoint_mutation_performed: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "status") {
      const jobHash = text(body.job_hash), jobId = text(body.job_id), stored = findJob(project, jobHash, jobId);
      if (!stored) throw new Error("CREATIVE_AUDIO_LONG_FORM_JOB_NOT_FOUND");
      if (stored.status === "COMPLETED") return NextResponse.json({ success: true, worker, result: stored, provider_job_submitted: false, endpoint_mutation_performed: false }, { headers: { "Cache-Control": "no-store" } });
      const result = await pollProfessionalAudioLongFormWorkerJob({ job_id: jobId, job_hash: jobHash });
      await persistJob(project, jobHash, { job_id: jobId, status: result.status || stored.status, progress_percent: result.progress_percent ?? stored.progress_percent, status_detail: result.status_detail || null, error: result.error || null, last_polled_at: new Date().toISOString() });
      return NextResponse.json({ success: true, worker, result, provider_job_submitted: false, endpoint_mutation_performed: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action !== "plan") throw new Error("CREATIVE_AUDIO_LONG_FORM_ACTION_INVALID");
    return NextResponse.json({ success: true, release_plan: { contract: releasePlan.contract, project_revision: releasePlan.project_revision, duration_seconds: releasePlan.duration_seconds, sample_rate: releasePlan.sample_rate, channels: releasePlan.channels, channel_layout: releasePlan.channel_layout, delivery_profile: releasePlan.delivery_profile, long_form_delivery: releasePlan.long_form_delivery }, graph_fingerprint: graphFingerprint, long_form_plan: longFormPlan, worker, provider_job_submitted: false, endpoint_mutation_performed: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Long-form audio render failed", provider_job_submitted: false }, { status: error?.status || 400 });
  }
}
