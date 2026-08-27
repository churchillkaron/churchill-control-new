export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const EXECUTION_PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
const MULTITRACK_METADATA_KEY = "music_multitrack_project";
const RELEASE_KINDS = new Set(["MIX_RENDER", "MASTER", "TRACK_STEM_RENDER", "GROUP_STEM_RENDER", "INSTRUMENTAL", "ACAPELLA"]);

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

async function requireAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: EXECUTION_PERMISSIONS });
  if (!access.success) {
    const error = new Error(access.error || "CREATIVE_MUSIC_MASTER_LIBRARY_ACCESS_FORBIDDEN");
    error.status = access.status || 403;
    throw error;
  }
}

async function projectInScope(organizationId, projectId) {
  if (!projectId) throw new Error("creative_project_id required");
  const project = await CreativeProjectRepository.getById(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    const error = new Error("CREATIVE_MUSIC_MASTER_LIBRARY_PROJECT_NOT_FOUND");
    error.status = 404;
    throw error;
  }
  return project;
}

async function secureReference(organizationId, value) {
  const source = text(value);
  if (!source) return null;
  try {
    return await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: source });
  } catch {
    return null;
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    const projectId = text(body.creative_project_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    await requireAccess(request, organizationId);
    const project = await projectInScope(organizationId, projectId);
    const currentRevision = Math.max(0, Math.round(finite(project.metadata?.[MULTITRACK_METADATA_KEY]?.revision, 0)));
    const assets = await CreativeAssetsRuntime.list({ organization_id: organizationId, creative_project_id: projectId, limit: 1000 });
    const releases = [];
    for (const asset of assets) {
      const kind = text(asset.metadata?.music_asset_kind).toUpperCase();
      if (!RELEASE_KINDS.has(kind)) continue;
      const revision = Math.max(0, Math.round(finite(asset.metadata?.project_revision, 0)));
      const primaryUrl = await secureReference(organizationId, asset.file_url || asset.url);
      const waveformUrl = await secureReference(organizationId, asset.metadata?.waveform_url);
      const deliveries = [];
      for (const delivery of asset.metadata?.deliveries || []) {
        deliveries.push({
          name: text(delivery.name) || null,
          mime_type: text(delivery.mime_type) || null,
          url: await secureReference(organizationId, delivery.url),
        });
      }
      const validation = asset.metadata?.technical_validation || null;
      releases.push({
        id: asset.id,
        kind,
        name: text(asset.name || asset.title || asset.file_name || kind),
        file_name: text(asset.file_name) || null,
        created_at: asset.created_at || asset.metadata?.mastered_at || asset.metadata?.rendered_at || null,
        project_revision: revision,
        current_revision: revision === currentRevision,
        render_plan_fingerprint: text(asset.metadata?.render_plan_fingerprint) || null,
        source_mix_asset_id: text(asset.metadata?.source_mix_asset_id) || null,
        source_asset_ids: Array.isArray(asset.metadata?.source_asset_ids) ? asset.metadata.source_asset_ids : [],
        mastering_profile: text(asset.metadata?.mastering_profile || asset.metadata?.mastering?.profile) || null,
        integrated_lufs: finite(asset.metadata?.integrated_lufs, null),
        true_peak_dbtp: finite(asset.metadata?.true_peak_dbtp, null),
        peak_dbfs: finite(asset.metadata?.peak_dbfs, null),
        rms_dbfs: finite(asset.metadata?.rms_dbfs, null),
        headroom_db: finite(asset.metadata?.headroom_db, null),
        release_candidate: asset.metadata?.release_candidate === true,
        release_limiter_applied: asset.metadata?.release_limiter_applied === true,
        true_peak_certified: asset.metadata?.true_peak_certified === true,
        technical_validation_available: kind === "MASTER" && Boolean(asset.metadata?.music_finish_task_id),
        technical_validation_passed: asset.metadata?.technical_validation_passed === true,
        technical_validated_at: asset.metadata?.technical_validated_at || null,
        technical_validation_contract: text(asset.metadata?.technical_validation_contract) || null,
        technical_validation_failures: Array.isArray(validation?.failures) ? validation.failures : [],
        technical_validation_warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
        validated_checksum_verified: validation?.checksum?.verified === true,
        validation_observed_integrated_lufs: finite(validation?.observed?.integrated_lufs, null),
        validation_observed_true_peak_dbtp: finite(validation?.observed?.true_peak_dbtp, null),
        validation_observed_sample_rate: finite(validation?.observed?.sample_rate, null),
        validation_observed_channels: finite(validation?.observed?.channels, null),
        validation_observed_codec: text(validation?.observed?.codec_name) || null,
        validation_current_revision: asset.metadata?.validation_project_revision_current === true,
        stem_stage: text(asset.metadata?.stem_stage) || null,
        target_id: text(asset.metadata?.target_id) || null,
        primary_url: primaryUrl,
        waveform_url: waveformUrl,
        deliveries,
      });
    }
    releases.sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));
    return NextResponse.json({
      success: true,
      contract: "AVANTIQO_MUSIC_MASTER_LIBRARY_V2",
      current_revision: currentRevision,
      releases,
      provider_job_submitted: false,
      endpoint_mutation_performed: false,
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Music master library failed" }, { status: error?.status || 400 });
  }
}
