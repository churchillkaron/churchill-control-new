export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeMissionRuntime,
} from "@/lib/creative/missions/runtime/CreativeMissionRuntime";
import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeAssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  CreativePerformanceVideoIntelligenceRuntime,
} from "@/lib/creative/media/runtime/CreativePerformanceVideoIntelligenceRuntime";

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
  return String(value)
    .split(",")
    .map(text)
    .filter(Boolean);
}

function assetId(value) {
  if (typeof value === "string") return text(value);
  return text(value?.asset_id || value?.id);
}

function selectedAssetIds(body = {}) {
  const explicit = [
    ...normalizeList(body.selected_asset_ids),
    ...normalizeList(body.selectedAssetIds),
    ...normalizeList(body.asset_ids),
    ...normalizeList(body.assetIds),
  ];
  const embedded = Array.isArray(body.assets)
    ? body.assets.map(assetId).filter(Boolean)
    : [];
  return [...new Set([...explicit, ...embedded])];
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function resolveSelectedAssets({ organizationId, body }) {
  const ids = selectedAssetIds(body);
  const assets = [];

  for (const id of ids) {
    const asset = await CreativeAssetsRuntime.get(id);
    if (!asset || String(asset.organization_id) !== String(organizationId)) {
      throw new Error(`CREATIVE_SELECTED_ASSET_NOT_FOUND:${id}`);
    }
    if (
      asset.archived === true ||
      ["ARCHIVED", "DISABLED", "DELETED"].includes(
        text(asset.status).toUpperCase(),
      )
    ) {
      throw new Error(`CREATIVE_SELECTED_ASSET_UNAVAILABLE:${id}`);
    }
    assets.push(asset);
  }

  return assets;
}

function requestMetadata(body = {}) {
  const metadata = { ...object(body.metadata) };
  if (Array.isArray(body.publish_targets)) {
    metadata.publish_targets = body.publish_targets;
  }
  if (object(body.publish_target).id) {
    metadata.publish_targets = [body.publish_target];
  }
  if (Object.keys(object(body.creative_quality_policy)).length) {
    metadata.creative_quality_policy = body.creative_quality_policy;
  }
  if (Object.keys(object(body.semantic_quality_policy)).length) {
    metadata.semantic_quality_policy = body.semantic_quality_policy;
  }
  return metadata;
}

function missionPayload(body, organizationId) {
  const intent = text(
    body.intent ||
    body.request ||
    body.objective ||
    body.business_goal,
  );

  if (!intent) throw new Error("creative intent required");

  return {
    organization_id: organizationId,
    campaign_id: body.campaign_id || body.campaignId || null,
    title: text(body.title) || intent.slice(0, 120),
    business_goal: intent,
    objective: intent,
    audience: object(body.audience),
    channels: normalizeList(body.channels || body.target_channels),
    metadata: {
      ...requestMetadata(body),
      source: "natural_language_creative_intent",
      production_type:
        body.production_type || body.productionType || null,
      target_duration: positiveNumber(
        body.target_duration ?? body.duration_seconds,
      ),
      target_languages: normalizeList(
        body.target_languages || body.languages,
      ),
      quality_profile:
        body.quality_profile || body.qualityProfile || null,
      budget_profile:
        body.budget_profile || body.budgetProfile || null,
      desired_outcome:
        text(body.desired_outcome || body.desiredOutcome),
      communication_goal:
        text(body.communication_goal || body.communicationGoal),
      call_to_action:
        text(body.call_to_action || body.callToAction),
      tone: text(body.tone),
      emotion: text(body.emotion),
      products: Array.isArray(body.products) ? body.products : [],
      markets: Array.isArray(body.markets) ? body.markets : [],
      context: object(body.context),
      original_intent: intent,
      selected_asset_ids: selectedAssetIds(body),
    },
  };
}

function performanceIntelligenceRequired(body = {}) {
  const metadata = object(body.metadata);
  return (
    metadata.require_subject_tracking === true ||
    metadata.require_song_boundary_detection === true ||
    metadata.live_showreel === true ||
    metadata.performance_video_intelligence_required === true
  );
}

function performancePolicy(body = {}) {
  const metadata = object(body.metadata);
  const configured = object(
    metadata.performance_video_policy ||
    metadata.performanceVideoPolicy,
  );
  return {
    version: "performance-video-v1",
    requested_subject:
      text(configured.requested_subject || configured.requestedSubject) ||
      "primary lead vocalist",
    minimum_usable_sections:
      positiveNumber(configured.minimum_usable_sections) || 1,
    minimum_verified_samples:
      positiveNumber(configured.minimum_verified_samples) || 2,
    minimum_quality_score:
      positiveNumber(configured.minimum_quality_score) || 55,
    minimum_primary_performer_ratio:
      Number.isFinite(Number(configured.minimum_primary_performer_ratio))
        ? Number(configured.minimum_primary_performer_ratio)
        : 0.5,
    minimum_vocalist_ratio:
      Number.isFinite(Number(configured.minimum_vocalist_ratio))
        ? Number(configured.minimum_vocalist_ratio)
        : 0.5,
    minimum_section_seconds:
      positiveNumber(configured.minimum_section_seconds) || 12,
    maximum_section_seconds:
      positiveNumber(configured.maximum_section_seconds) || 75,
    minimum_boundary_silence_seconds:
      positiveNumber(configured.minimum_boundary_silence_seconds) || 1.2,
    silence_noise_db:
      Number.isFinite(Number(configured.silence_noise_db))
        ? Number(configured.silence_noise_db)
        : -32,
    silence_duration_seconds:
      positiveNumber(configured.silence_duration_seconds) || 1.2,
    sample_fractions: Array.isArray(configured.sample_fractions)
      ? configured.sample_fractions
      : [0.25, 0.5, 0.75],
    output_width: positiveNumber(configured.output_width) || 1920,
    output_height: positiveNumber(configured.output_height) || 1080,
    frame_rate: positiveNumber(configured.frame_rate) || 30,
    video_codec: text(configured.video_codec) || "libx264",
    video_preset: text(configured.video_preset) || "medium",
    video_crf:
      Number.isFinite(Number(configured.video_crf))
        ? Number(configured.video_crf)
        : 18,
    audio_codec: text(configured.audio_codec) || "aac",
    audio_bitrate: text(configured.audio_bitrate) || "192k",
    ...configured,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId =
      body.organization_id || body.organizationId || null;

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.mission.create",
        "creative.execute",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const assets = await resolveSelectedAssets({
      organizationId,
      body,
    });
    const mission = await CreativeMissionRuntime.create(
      missionPayload(body, organizationId),
    );
    const started = await CreativeMissionRuntime.start(mission.id);
    const creativeProjectId =
      started.runtime_context?.creative_project_id || null;
    const creativeBriefId =
      started.runtime_context?.creative_brief_id || null;

    if (!creativeProjectId) {
      throw new Error("Creative mission did not create a project");
    }

    const project = await CreativeProjectRuntime.get(creativeProjectId);
    if (!project || String(project.organization_id) !== String(organizationId)) {
      throw new Error("Creative project not found");
    }

    const selectedIds = assets.map((asset) => asset.id);
    const metadata = {
      ...(project.metadata || {}),
      ...requestMetadata(body),
      selected_asset_ids: selectedIds,
      selected_assets_locked_at: new Date().toISOString(),
      selected_assets_source: "creative_create_command",
    };
    const updatedProject = await CreativeProjectRuntime.update(
      creativeProjectId,
      { metadata },
    );

    const attachedAssetNodes = await CreativeAssetGraphRepository.attachAssetsToProject({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
      creative_asset_ids: selectedIds,
    });
    if (attachedAssetNodes.length < selectedIds.length) {
      throw new Error("CREATIVE_SELECTED_ASSET_NODE_ATTACHMENT_INCOMPLETE");
    }

    const performanceIntelligence = [];
    if (performanceIntelligenceRequired(body)) {
      const selectedVideos = attachedAssetNodes.filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.VIDEO,
      );
      if (!selectedVideos.length) {
        throw new Error("PERFORMANCE_VIDEO_ASSET_REQUIRED");
      }

      for (const video of selectedVideos) {
        const result = await CreativePerformanceVideoIntelligenceRuntime.analyze({
          organization_id: organizationId,
          parent_asset_node_id: video.id,
          policy: performancePolicy(body),
        });
        if (!Array.isArray(result.moments) || !result.moments.length) {
          throw new Error(`PERFORMANCE_VIDEO_INTELLIGENCE_REQUIRED:${video.id}`);
        }
        performanceIntelligence.push({
          source_asset_node_id: video.id,
          analysis_identity: result.analysis_identity,
          moment_ids: result.moments.map((moment) => moment.id),
          detected_section_count: result.detected_sections?.length || null,
        });
      }
    }

    const execution = await CreativeDirectorRuntime.execute({
      organization_id: organizationId,
      creative_mission_id: started.id,
      creative_project_id: creativeProjectId,
      creative_brief_id: creativeBriefId,
      mission: started,
      project: updatedProject,
      objective: started.objective || started.business_goal || body.intent || "",
      business_goal: started.business_goal || started.objective || body.intent || "",
      audience: started.audience || {},
      assets,
      requestedOutputs: normalizeList(
        body.requestedOutputs ||
        body.requested_outputs ||
        body.channels ||
        body.target_channels,
      ),
      organization: body.organization || access.organization || {},
      brand: body.brand || {},
    });

    return Response.json({
      success: execution.success !== false,
      status:
        execution.skipped
          ? "ALREADY_COMPLETED"
          : execution.production?.post_production?.status ||
            execution.production?.status ||
            "PRODUCTION_STARTED",
      mission: started,
      creative_mission_id: started.id,
      creative_project_id: creativeProjectId,
      creative_brief_id: creativeBriefId,
      selected_asset_ids: selectedIds,
      attached_asset_node_ids: attachedAssetNodes.map((node) => node.id),
      performance_intelligence: performanceIntelligence,
      execution,
      next_action:
        execution.production?.post_production?.status === "READY_FOR_APPROVAL"
          ? "REVIEW_AND_APPROVE"
          : "RESUME_CREATIVE_PIPELINE",
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
        validation: error?.validation || error?.cause?.validation || null,
      },
      { status: 500 },
    );
  }
}
