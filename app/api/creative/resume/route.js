export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import * as CreativeAssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  return String(value).split(",").map(text).filter(Boolean);
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sourceVideo(node = {}) {
  return (
    node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO &&
    !node.parent_asset_node_id &&
    node.metadata?.performance_verified !== true &&
    text(node.lineage?.source).toLowerCase() !== "performance_video_reframe"
  );
}

function verifiedMoment(node = {}) {
  return (
    node.type === CREATIVE_ASSET_NODE_TYPES.MOMENT &&
    node.metadata?.performance_verified === true &&
    node.metadata?.blocked !== true &&
    Boolean(node.url)
  );
}

function performanceSummary(sourceVideos = [], moments = []) {
  return sourceVideos.map((video) => {
    const sourceMoments = moments.filter((moment) =>
      String(moment.metadata?.source_asset_node_id || "") === String(video.id),
    );
    return {
      source_asset_node_id: video.id,
      creative_asset_id: video.creative_asset_id || null,
      source_name: video.name || null,
      analysis_identity:
        sourceMoments.find((moment) => moment.metadata?.performance_analysis_identity)
          ?.metadata?.performance_analysis_identity || null,
      moment_ids: sourceMoments.map((moment) => moment.id),
      verified_section_count: sourceMoments.length,
      verified_duration_seconds: sourceMoments.reduce(
        (sum, moment) => sum + finite(
          moment.technical?.duration_seconds ??
          moment.metadata?.original_source_range?.duration_seconds,
          0,
        ),
        0,
      ),
      reused: true,
    };
  }).filter((entry) => entry.moment_ids.length);
}

function selectedAssetIds(body, project, nodes) {
  const explicit = [
    ...normalizeList(body.selected_asset_ids),
    ...normalizeList(body.selectedAssetIds),
  ];
  const persisted = normalizeList(project.metadata?.selected_asset_ids);
  const inferred = nodes
    .filter((node) =>
      sourceVideo(node) || node.type === CREATIVE_ASSET_NODE_TYPES.LOGO,
    )
    .map((node) => text(node.creative_asset_id))
    .filter(Boolean);
  return [...new Set([...explicit, ...persisted, ...inferred])];
}

async function resolveAssets(organizationId, ids) {
  const assets = [];
  for (const id of ids) {
    const asset = await CreativeAssetsRuntime.get(id);
    if (!asset || String(asset.organization_id) !== String(organizationId)) {
      throw new Error(`CREATIVE_PERSISTED_ASSET_NOT_FOUND:${id}`);
    }
    if (
      asset.archived === true ||
      ["ARCHIVED", "DISABLED", "DELETED"].includes(
        text(asset.status).toUpperCase(),
      )
    ) {
      throw new Error(`CREATIVE_PERSISTED_ASSET_UNAVAILABLE:${id}`);
    }
    assets.push(asset);
  }
  return assets;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(
      body.organization_id || body.organizationId,
    );
    const missionId = text(
      body.creative_mission_id || body.creativeMissionId || body.mission_id,
    );

    if (!missionId) {
      throw new Error("creative_mission_id required");
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.execute",
        "creative.production.run",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const existingMission = await CreativeMissionRuntime.get(missionId);
    if (
      !existingMission ||
      String(existingMission.organization_id) !== String(organizationId)
    ) {
      throw new Error("CREATIVE_PERSISTED_MISSION_NOT_FOUND");
    }
    if (text(existingMission.status).toUpperCase() === "ARCHIVED") {
      throw new Error("CREATIVE_PERSISTED_MISSION_ARCHIVED");
    }

    const mission = await CreativeMissionRuntime.start(missionId);
    const projectId = mission.runtime_context?.creative_project_id || null;
    const briefId = mission.runtime_context?.creative_brief_id || null;
    if (!projectId) throw new Error("CREATIVE_PERSISTED_PROJECT_REQUIRED");

    const project = await CreativeProjectRuntime.get(projectId);
    if (
      !project ||
      String(project.organization_id) !== String(organizationId)
    ) {
      throw new Error("CREATIVE_PERSISTED_PROJECT_NOT_FOUND");
    }

    const nodes = await CreativeAssetGraphRepository.listByProject({
      organization_id: organizationId,
      creative_project_id: projectId,
    });
    const sourceVideos = nodes.filter(sourceVideo);
    const moments = nodes.filter(verifiedMoment);

    if (!sourceVideos.length) {
      throw new Error("CREATIVE_PERSISTED_SOURCE_VIDEOS_REQUIRED");
    }
    if (!moments.length) {
      throw new Error("CREATIVE_PERSISTED_PERFORMANCE_MOMENTS_REQUIRED");
    }

    const performanceIntelligence = performanceSummary(sourceVideos, moments);
    const verifiedDuration = performanceIntelligence.reduce(
      (sum, entry) => sum + entry.verified_duration_seconds,
      0,
    );
    const verifiedSources = performanceIntelligence.length;
    const targetDuration = finite(
      project.target_duration ?? project.metadata?.target_duration,
      0,
    );

    if (!performanceIntelligence.length) {
      throw new Error("CREATIVE_PERSISTED_PERFORMANCE_LINKAGE_INVALID");
    }
    if (targetDuration > 0 && verifiedDuration < targetDuration) {
      const error = new Error("CREATIVE_PERSISTED_DURATION_INSUFFICIENT");
      error.validation = {
        target_duration_seconds: targetDuration,
        verified_duration_seconds: verifiedDuration,
        verified_source_count: verifiedSources,
      };
      throw error;
    }

    const assetIds = selectedAssetIds(body, project, nodes);
    if (!assetIds.length) {
      throw new Error("CREATIVE_PERSISTED_SELECTED_ASSETS_REQUIRED");
    }
    const assets = await resolveAssets(organizationId, assetIds);

    const metadata = {
      ...object(project.metadata),
      selected_asset_ids: assetIds,
      performance_video_intelligence_required: true,
      performance_intelligence: performanceIntelligence,
      persisted_analysis_reused: true,
      persisted_analysis_reused_at: new Date().toISOString(),
      persisted_verified_duration_seconds: verifiedDuration,
      persisted_verified_source_count: verifiedSources,
    };
    const updatedProject = await CreativeProjectRuntime.update(projectId, {
      metadata,
    });

    const execution = await CreativeDirectorRuntime.execute({
      organization_id: organizationId,
      creative_mission_id: mission.id,
      creative_project_id: projectId,
      creative_brief_id: briefId,
      mission,
      project: updatedProject,
      objective:
        mission.objective || mission.business_goal || project.objective || "",
      business_goal:
        mission.business_goal || mission.objective || project.objective || "",
      audience: mission.audience || {},
      assets,
      requestedOutputs: normalizeList(
        body.requested_outputs ||
        body.requestedOutputs ||
        project.target_channels ||
        mission.channels,
      ),
      organization: body.organization || access.organization || {},
      brand: body.brand || {},
      requested_by_user_id: access.userId,
      requested_by_staff_account_id: access.access?.staffAccountId || null,
      execution_access: {
        authenticated: true,
        role: access.role || null,
        permissions: access.permissions || [],
      },
    });

    return Response.json({
      success: execution.success !== false,
      status: execution.skipped
        ? "ALREADY_COMPLETED"
        : execution.production?.post_production?.status ||
          execution.production?.status ||
          "PRODUCTION_RESUMED",
      creative_mission_id: mission.id,
      creative_project_id: projectId,
      creative_brief_id: briefId,
      selected_asset_ids: assetIds,
      persisted_analysis_reused: true,
      verified_moment_count: moments.length,
      verified_source_count: verifiedSources,
      verified_duration_seconds: verifiedDuration,
      performance_intelligence: performanceIntelligence,
      execution,
      next_action:
        execution.production?.post_production?.status === "READY_FOR_APPROVAL"
          ? "REVIEW_AND_APPROVE"
          : "RESUME_CREATIVE_PIPELINE",
    });
  } catch (error) {
    const message = error?.message || String(error);
    const status = message.includes("NOT_FOUND")
      ? 404
      : message.includes("REQUIRED") ||
          message.includes("INVALID") ||
          message.includes("INSUFFICIENT")
        ? 400
        : 500;
    return Response.json({
      success: false,
      error: message,
      validation: error?.validation || null,
    }, { status });
  }
}
