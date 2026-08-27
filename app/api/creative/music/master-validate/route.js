export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { unwrapAudioOutput } from "@/lib/creative/audio/runtime/AudioFinishingContractRuntime";
import { validateMusicMasterArtifact } from "@/lib/creative/music/runtime/CreativeMusicMasterValidationRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const MULTITRACK_METADATA_KEY = "music_multitrack_project";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredAnyPermission: EXECUTION_PERMISSIONS,
  });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_MASTER_VALIDATION_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_MASTER_VALIDATION_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

function technicalEvidence(output = {}, asset = {}) {
  const report = output.master_report || {};
  const master = report.master || {};
  return {
    expected_checksum: text(output.checksum) || null,
    master_report: report,
    expected: {
      master_id: text(output.master_id || report.master_id) || null,
      target_lufs: finite(master.target_lufs, null),
      true_peak_dbtp: finite(master.true_peak_dbtp, null),
      loudness_range_lu: finite(master.loudness_range_lu, null),
      tolerance_lu: finite(master.tolerance_lu, 0.5),
      true_peak_tolerance_db: finite(master.true_peak_tolerance_db, 0.1),
      sample_rate: finite(master.sample_rate, null),
      channels: finite(master.channels, null),
      duration_seconds: finite(master.duration_seconds, null),
      codec_name: text(master.codec_name) || null,
      mastering_profile: text(asset.metadata?.mastering_profile) || null,
    },
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    const assetId = text(body.master_asset_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    if (!assetId) return NextResponse.json({ success: false, error: "master_asset_id required" }, { status: 400 });
    await requireAccess(request, organizationId);

    const project = await projectInScope(organizationId, projectId);
    const asset = await CreativeAssetsRuntime.get(assetId);
    if (!asset || String(asset.organization_id) !== String(organizationId) || String(asset.creative_project_id) !== String(projectId)) {
      const error = new Error("CREATIVE_MUSIC_MASTER_VALIDATION_ASSET_NOT_FOUND");
      error.status = 404;
      throw error;
    }
    if (text(asset.metadata?.music_asset_kind).toUpperCase() !== "MASTER") {
      throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_MASTER_REQUIRED");
    }

    const finishTaskId = text(asset.metadata?.music_finish_task_id);
    if (!finishTaskId) throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_FINISH_TASK_REQUIRED");
    const finishTask = await ProductionTaskRuntime.get(finishTaskId);
    if (!finishTask || finishTask.status !== "COMPLETED" || String(finishTask.organization_id) !== String(organizationId) || String(finishTask.creative_project_id) !== String(projectId)) {
      throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_FINISH_EVIDENCE_REQUIRED");
    }
    const output = unwrapAudioOutput(finishTask.output || {});
    if (!output?.master_report || output.master_report?.passed !== true || !text(output.checksum)) {
      throw new Error("CREATIVE_MUSIC_MASTER_VALIDATION_ORIGINAL_REPORT_REQUIRED");
    }

    const evidence = technicalEvidence(output, asset);
    const validation = await validateMusicMasterArtifact({
      organization_id: organizationId,
      file_url: asset.file_url,
      file_name: asset.file_name || `${asset.id}.wav`,
      mime_type: asset.metadata?.mime_type || output.mime_type || "audio/wav",
      expected_checksum: evidence.expected_checksum,
      master_report: evidence.master_report,
      expected: evidence.expected,
    });

    const currentRevision = Math.max(0, Math.round(finite(project.metadata?.[MULTITRACK_METADATA_KEY]?.revision, 0)));
    const assetRevision = Math.max(0, Math.round(finite(asset.metadata?.project_revision, 0)));
    const nextMetadata = {
      ...(asset.metadata || {}),
      technical_validation: validation,
      technical_validation_contract: validation.contract,
      technical_validation_passed: validation.passed === true,
      technical_validated_at: validation.validated_at,
      technically_validated_against_finish_task_id: finishTaskId,
      validation_project_revision_current: assetRevision === currentRevision,
    };
    await CreativeAssetsRuntime.update(asset.id, { metadata: nextMetadata });

    return NextResponse.json({
      success: validation.passed === true,
      contract: "AVANTIQO_MUSIC_MASTER_VALIDATION_RESPONSE_V1",
      master_asset_id: asset.id,
      project_revision: assetRevision,
      current_project_revision: currentRevision,
      current_revision: assetRevision === currentRevision,
      validation,
      provider_job_submitted: false,
      remastering_performed: false,
      endpoint_mutation_performed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error?.message || "Music master validation failed",
      provider_job_submitted: false,
      remastering_performed: false,
      endpoint_mutation_performed: false,
    }, { status: error?.status || 400 });
  }
}
