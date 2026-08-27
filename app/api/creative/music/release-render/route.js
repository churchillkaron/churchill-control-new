export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { dispatchAudioTask } from "@/lib/creative/audio/runtime/AudioQueueRuntime";
import { unwrapAudioOutput } from "@/lib/creative/audio/runtime/AudioFinishingContractRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { buildMusicReleaseRenderPlan } from "@/lib/creative/music/runtime/CreativeMusicReleaseRenderPlanRuntime";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const MUSIC_BUCKET = "creative-assets";
const MULTITRACK_METADATA_KEY = "music_multitrack_project";
const MAX_RENDER_BYTES = 2_147_483_648;

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }
function sortedUnique(values = []) { return [...new Set(values.map(text).filter(Boolean))].sort(); }

function safeWavName(value) {
  const original = text(value || "music-premaster.wav");
  if (!/\.wav$/i.test(original)) throw new Error("CREATIVE_MUSIC_RELEASE_WAV_REQUIRED");
  const base = original.replace(/\.wav$/i, "").normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "music-premaster";
  return `${base}.wav`;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_RELEASE_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_RELEASE_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function currentSession(project) {
  const session = project?.metadata?.[MULTITRACK_METADATA_KEY];
  if (!session) throw new Error("CREATIVE_MUSIC_RELEASE_MULTITRACK_REQUIRED");
  return session;
}

function assertRevision(session, expectedRevision, prefix = "CREATIVE_MUSIC_RELEASE") {
  const current = Math.max(0, Math.round(finite(session.revision, 0)));
  const expected = Math.max(0, Math.round(finite(expectedRevision, -1)));
  if (expected !== current) {
    const error = new Error(`${prefix}_REVISION_CONFLICT:expected=${expected}:current=${current}`);
    error.status = 409;
    throw error;
  }
  return current;
}

async function planRelease(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const session = currentSession(project);
  const plan = buildMusicReleaseRenderPlan(session, body.options || body);
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_RELEASE_PLAN_RESPONSE_V1",
    plan,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function prepareUpload(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const session = currentSession(project);
  const revision = assertRevision(session, body.expected_revision);
  const plan = buildMusicReleaseRenderPlan(session, body.options || body);
  if (!plan.readiness.release_render_ready) throw new Error(`CREATIVE_MUSIC_RELEASE_RENDER_BLOCKED:${plan.readiness.blockers.map((item) => item.code).join(",") || "NOT_READY"}`);
  const sizeBytes = finite(body.size_bytes, null);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_RENDER_BYTES) throw new Error(`CREATIVE_MUSIC_RELEASE_SIZE_INVALID:max=${MAX_RENDER_BYTES}`);
  const fileName = safeWavName(body.file_name);
  const path = `${organizationId}/derived/music-mix/${projectId}/r${revision}/${randomUUID()}-${fileName}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(MUSIC_BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CREATIVE_MUSIC_RELEASE_UPLOAD_URL_REQUIRED");
  return {
    success: true,
    contract: "AVANTIQO_MUSIC_PREMASTER_UPLOAD_V1",
    upload_url: data.signedUrl,
    storage_reference: `storage://${MUSIC_BUCKET}/${path}`,
    project_revision: revision,
    source_asset_ids: plan.source_asset_ids,
    renderer: plan.renderer,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function registerMix(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const project = await projectInScope(organizationId, projectId);
  const session = currentSession(project);
  const revision = assertRevision(session, body.expected_revision);
  const plan = buildMusicReleaseRenderPlan(session, body.options || body);
  if (!plan.readiness.release_render_ready) throw new Error(`CREATIVE_MUSIC_RELEASE_RENDER_BLOCKED:${plan.readiness.blockers.map((item) => item.code).join(",") || "NOT_READY"}`);
  const storageReference = text(body.storage_reference);
  const expectedPrefix = `storage://${MUSIC_BUCKET}/${organizationId}/derived/music-mix/${projectId}/r${revision}/`;
  if (!storageReference.startsWith(expectedPrefix)) throw new Error("CREATIVE_MUSIC_RELEASE_STORAGE_REFERENCE_INVALID");
  const submittedSourceIds = sortedUnique(body.source_asset_ids || []);
  const expectedSourceIds = sortedUnique(plan.source_asset_ids);
  if (JSON.stringify(submittedSourceIds) !== JSON.stringify(expectedSourceIds)) throw new Error("CREATIVE_MUSIC_RELEASE_SOURCE_LINEAGE_MISMATCH");
  const durationSeconds = finite(body.program_duration_seconds, null);
  const renderDurationSeconds = finite(body.render_duration_seconds, null);
  const sampleRate = finite(body.sample_rate, null);
  const channels = finite(body.channels, null);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error("CREATIVE_MUSIC_RELEASE_DURATION_REQUIRED");
  if (Math.abs(durationSeconds - plan.duration_seconds) > 0.25) throw new Error("CREATIVE_MUSIC_RELEASE_DURATION_MISMATCH");
  if (Math.round(sampleRate) !== Math.round(plan.sample_rate) || Math.round(channels) !== 2) throw new Error("CREATIVE_MUSIC_RELEASE_FORMAT_MISMATCH");
  const levels = body.levels || {};
  const peakDbfs = finite(levels.peak_dbfs, null);
  const rmsDbfs = finite(levels.rms_dbfs, null);
  if (!Number.isFinite(peakDbfs) || !Number.isFinite(rmsDbfs)) throw new Error("CREATIVE_MUSIC_RELEASE_LEVEL_EVIDENCE_REQUIRED");
  const fileName = safeWavName(body.file_name);

  const asset = await CreativeAssetsRuntime.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: project.creative_mission_id || null,
    asset_type: "AUDIO",
    file_url: storageReference,
    file_name: fileName,
    name: text(body.title || `${plan.title} — Pre-master`),
    title: text(body.title || `${plan.title} — Pre-master`),
    description: "Offline-rendered Avantiqo Music Workstation pre-master. Final loudness and true-peak certification are not yet applied.",
    ai_generated: false,
    provider: "avantiqo-music-workstation",
    engine: plan.renderer,
    prompt: null,
    metadata: {
      media_kind: "MUSIC",
      mime_type: "audio/wav",
      music_asset_kind: "MIX_RENDER",
      release_render_contract: plan.contract,
      offline_render_contract: text(body.offline_render_contract || "AVANTIQO_MUSIC_OFFLINE_MIX_RENDER_V1"),
      project_revision: revision,
      program_duration_seconds: durationSeconds,
      render_duration_seconds: renderDurationSeconds,
      sample_rate: sampleRate,
      channels,
      bit_depth: 24,
      peak_dbfs: peakDbfs,
      rms_dbfs: rmsDbfs,
      clipping: levels.clipping === true,
      headroom_db: finite(levels.headroom_db, null),
      source_asset_ids: expectedSourceIds,
      source_assets_preserved: true,
      full_mix_processing_applied: true,
      release_limiter_applied: false,
      true_peak_certified: false,
      mastering: plan.master.mastering,
      derived_asset: true,
      destructive_edit: false,
      rendered_at: new Date().toISOString(),
    },
    tags: ["music", "mix", "premaster", "derived", "24-bit"],
  });

  return {
    success: true,
    contract: "AVANTIQO_MUSIC_PREMASTER_ASSET_V1",
    asset_id: asset.id,
    storage_reference: asset.file_url,
    project_revision: revision,
    release_limiter_applied: false,
    true_peak_certified: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

async function finishRelease(body) {
  const organizationId = text(body.organization_id);
  const projectId = text(body.creative_project_id);
  const mixAssetId = text(body.mix_asset_id);
  if (!mixAssetId) throw new Error("CREATIVE_MUSIC_RELEASE_MIX_ASSET_REQUIRED");
  const project = await projectInScope(organizationId, projectId);
  const session = currentSession(project);
  const asset = await CreativeAssetsRuntime.get(mixAssetId);
  if (!asset || String(asset.organization_id) !== String(organizationId) || String(asset.creative_project_id) !== String(projectId)) throw new Error("CREATIVE_MUSIC_RELEASE_MIX_ASSET_NOT_FOUND");
  if (text(asset.metadata?.music_asset_kind) !== "MIX_RENDER") throw new Error("CREATIVE_MUSIC_RELEASE_MIX_ASSET_INVALID");
  const revision = assertRevision(session, asset.metadata?.project_revision, "CREATIVE_MUSIC_RELEASE_MIX_STALE");
  const plan = buildMusicReleaseRenderPlan(session, body.options || { mastering: asset.metadata?.mastering || {} });
  const currentSourceIds = sortedUnique(plan.source_asset_ids);
  if (JSON.stringify(currentSourceIds) !== JSON.stringify(sortedUnique(asset.metadata?.source_asset_ids || []))) throw new Error("CREATIVE_MUSIC_RELEASE_MIX_LINEAGE_STALE");
  if (!plan.readiness.release_render_ready) throw new Error("CREATIVE_MUSIC_RELEASE_CURRENT_PROJECT_NOT_READY");

  const tasks = await ProductionTaskRuntime.list({ organization_id: organizationId, creative_project_id: projectId });
  let sourceTask = tasks.find((task) => text(task.metadata?.music_mix_asset_id) === mixAssetId && text(task.metadata?.music_pipeline_role) === "PREMASTER_SOURCE") || null;
  if (!sourceTask) {
    sourceTask = await ProductionTaskRuntime.create({
      organization_id: organizationId,
      creative_project_id: projectId,
      type: "RENDER_AUDIO",
      status: "WAITING",
      title: `${plan.title} pre-master source`,
      description: "Immutable pre-master source for canonical Avantiqo audio finishing.",
      service_id: "creative.audio.finish",
      service_code: "creative.audio.finish",
      capability: "creative.audio.finish",
      priority: 94,
      input: { output_spec: { duration_seconds: asset.metadata?.program_duration_seconds, sample_rate: plan.sample_rate, channels: 2 } },
      cost: { estimated: 0, actual: 0, approved: true },
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: true },
      metadata: {
        workflow_kind: "AUDIO",
        production_step_id: "music-render",
        production_step_index: 1,
        audio_role: "program",
        music_pipeline_role: "PREMASTER_SOURCE",
        music_mix_asset_id: mixAssetId,
        project_revision: revision,
      },
    });
  }
  if (sourceTask.status !== "COMPLETED") {
    sourceTask = await ProductionTaskRuntime.complete(sourceTask.id, {
      provider: "avantiqo-music-workstation",
      settlement: "LOCAL_EXECUTION",
      output: {
        type: "ASSET",
        file_url: asset.file_url,
        audio_url: asset.file_url,
        storage_reference: asset.file_url,
        mime_type: "audio/wav",
        duration_seconds: asset.metadata?.render_duration_seconds || asset.metadata?.program_duration_seconds,
      },
    });
  }

  const mastering = plan.master.mastering;
  let finishTask = tasks.find((task) => text(task.metadata?.music_mix_asset_id) === mixAssetId && text(task.metadata?.music_pipeline_role) === "RELEASE_MASTER") || null;
  if (!finishTask) {
    finishTask = await ProductionTaskRuntime.create({
      organization_id: organizationId,
      creative_project_id: projectId,
      type: "EXECUTE_CAPABILITY",
      status: "WAITING",
      title: `Master ${plan.title}`,
      description: "Apply final loudness/true-peak release finishing and export certified Music deliveries.",
      service_id: "creative.audio.finish",
      service_code: "creative.audio.finish",
      capability: "creative.audio.finish",
      priority: 95,
      depends_on: [sourceTask.id],
      input: {
        source_task_ids: [sourceTask.id],
        output_spec: {
          title: plan.title,
          tracks: [{ source_task_id: sourceTask.id, role: "program", label: `${plan.title} pre-master` }],
          loudness: {
            target_lufs: mastering.target_lufs,
            true_peak_dbtp: mastering.true_peak_dbtp,
            range_lu: mastering.loudness_range_lu,
            tolerance_lu: mastering.tolerance_lu,
            true_peak_tolerance_db: mastering.true_peak_tolerance_db,
          },
          sample_rate: plan.sample_rate,
          channels: 2,
          deliveries: [
            { id: "release-wav", format: "wav", file_name: "master.wav", codec: "pcm_s24le" },
            ...(plan.exports.release_mp3.enabled ? [{ id: "release-mp3", format: "mp3", file_name: "master.mp3", bitrate: "320k" }] : []),
          ],
          waveform: { width: 1600, height: 400 },
        },
        storage_policy: { bucket: MUSIC_BUCKET },
      },
      cost: { estimated: 0, actual: 0, approved: true },
      timing: { estimated_seconds: 0 },
      review: { required: false, approved: true },
      metadata: {
        workflow_kind: "AUDIO",
        production_step_id: "finish",
        production_step_index: 2,
        deliverable_type: "MUSIC",
        release_candidate: true,
        music_pipeline_role: "RELEASE_MASTER",
        music_mix_asset_id: mixAssetId,
        source_task_id: sourceTask.id,
        project_revision: revision,
        mastering_profile: mastering.profile,
        storage_policy: { bucket: MUSIC_BUCKET },
      },
    });
  }
  if (finishTask.status !== "COMPLETED") finishTask = await dispatchAudioTask(finishTask);
  if (finishTask.status !== "COMPLETED") throw new Error(`CREATIVE_MUSIC_RELEASE_FINISH_FAILED:${finishTask.error || finishTask.status}`);
  const output = unwrapAudioOutput(finishTask.output);
  const masterReference = text(output.master_url || output.audio_url || output.file_url || output.url);
  if (!masterReference) throw new Error("CREATIVE_MUSIC_RELEASE_MASTER_REFERENCE_REQUIRED");

  const existingAssets = await CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: 1000 });
  let masterAsset = existingAssets.find((entry) => text(entry.metadata?.music_finish_task_id) === text(finishTask.id)) || null;
  if (!masterAsset) {
    const report = output.master_report || {};
    masterAsset = await CreativeAssetsRuntime.create({
      organization_id: organizationId,
      creative_project_id: projectId,
      creative_mission_id: project.creative_mission_id || null,
      asset_type: "AUDIO",
      file_url: masterReference,
      file_name: `${text(plan.title).replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "music"}-master.wav`,
      name: `${plan.title} — Master`,
      title: `${plan.title} — Master`,
      description: "Release master certified by Avantiqo audio finishing for loudness and true peak.",
      ai_generated: false,
      provider: "avantiqo-local-audio-worker",
      engine: "AVANTIQO_AUDIO_FINISHING",
      prompt: null,
      metadata: {
        media_kind: "MUSIC",
        music_asset_kind: "MASTER",
        source_mix_asset_id: mixAssetId,
        project_revision: revision,
        music_finish_task_id: finishTask.id,
        mastering_profile: mastering.profile,
        integrated_lufs: finite(report.master?.integrated_lufs, null),
        true_peak_dbtp: finite(report.master?.true_peak_dbtp, null),
        release_candidate: output.release_candidate === true,
        waveform_url: output.waveform_url || report.waveform?.url || null,
        deliveries: (output.files || []).filter((file) => text(file.mime_type).startsWith("audio/")).map((file) => ({ name: file.name || null, url: file.url || null, mime_type: file.mime_type || null })),
        release_limiter_applied: true,
        true_peak_certified: true,
        source_assets_preserved: true,
        derived_asset: true,
        destructive_edit: false,
        mastered_at: new Date().toISOString(),
      },
      tags: ["music", "master", "release", "24-bit"],
    });
  }

  return {
    success: true,
    contract: "AVANTIQO_MUSIC_RELEASE_MASTER_V1",
    mix_asset_id: mixAssetId,
    master_asset_id: masterAsset.id,
    finish_task_id: finishTask.id,
    release_candidate: output.release_candidate === true,
    master_report: output.master_report || null,
    deliveries: masterAsset.metadata?.deliveries || [],
    waveform_url: masterAsset.metadata?.waveform_url || null,
    integrated_lufs: masterAsset.metadata?.integrated_lufs ?? null,
    true_peak_dbtp: masterAsset.metadata?.true_peak_dbtp ?? null,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const action = text(body.action || "plan").toLowerCase();
    const result = action === "plan" ? await planRelease(body)
      : action === "prepare_upload" ? await prepareUpload(body)
        : action === "register" ? await registerMix(body)
          : action === "finish" ? await finishRelease(body)
            : null;
    if (!result) return NextResponse.json({ success: false, error: "CREATIVE_MUSIC_RELEASE_ACTION_INVALID" }, { status: 400 });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Creative Music release render failed" }, { status: error?.status || 400 });
  }
}
