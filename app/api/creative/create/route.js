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
import {
  CreativeAssetAutoSelectionRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetAutoSelectionRuntime";
import * as CreativeAssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

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

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function creativeIntent(body = {}) {
  return text(
    body.intent ||
    body.request ||
    body.objective ||
    body.business_goal,
  );
}

function normalizeCreativeCommand(body = {}, organization = {}) {
  const intent = creativeIntent(body);
  if (!intent) throw new Error("creative intent required");

  const explicitChannels = normalizeList(
    body.channels || body.target_channels,
  );
  const explicitProductionType = text(
    body.production_type || body.productionType,
  ) || null;
  const explicitDuration = positiveNumber(
    body.target_duration ?? body.duration_seconds,
  );

  return {
    ...body,
    intent,
    request: body.request || intent,
    objective: body.objective || intent,
    business_goal: body.business_goal || intent,
    channels: explicitChannels,
    production_type: explicitProductionType,
    duration_seconds: explicitDuration,
    target_duration: explicitDuration,
    metadata: {
      ...object(body.metadata),
      source: "natural_language_creative_command",
      active_organization_id:
        organization.id || body.organization_id || body.organizationId || null,
      active_organization_name: organization.name || null,
      creative_solution_source: "DIRECTOR_RESOLVED_FROM_CONTEXT",
      command_boundary_media_inference: false,
      command_boundary_channel_inference: false,
      command_boundary_specialist_preprocessing: false,
      public_publish_authorized: false,
      publish_authorized: false,
      publication_requires_human_approval: true,
      production_dossier_approval_required: true,
    },
  };
}

async function resolveSelectedAssets({ organizationId, organization, body }) {
  const ids = selectedAssetIds(body);
  if (ids.length) {
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
    return {
      assets,
      selection: {
        source: "EXPLICIT_CREATIVE_COMMAND_ASSETS",
        organization_id: organizationId,
        selected_asset_ids: assets.map((asset) => asset.id),
        selected_assets: assets.map((asset) => ({
          asset_id: asset.id,
          name: asset.name || asset.title || asset.file_name || null,
        })),
      },
    };
  }

  const automatic = await CreativeAssetAutoSelectionRuntime.resolve({
    organization_id: organizationId,
    organization,
    intent: creativeIntent(body),
  });
  return {
    assets: automatic.assets,
    selection: {
      ...automatic,
      assets: undefined,
    },
  };
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
  const intent = creativeIntent(body);
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
      creative_solution_source: "DIRECTOR_RESOLVED_FROM_CONTEXT",
      production_type:
        text(body.production_type || body.productionType) || null,
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
      explicit_constraints: {
        production_type:
          text(body.production_type || body.productionType) || null,
        target_duration: positiveNumber(
          body.target_duration ?? body.duration_seconds,
        ),
        channels: normalizeList(body.channels || body.target_channels),
        target_languages: normalizeList(
          body.target_languages || body.languages,
        ),
      },
    },
  };
}

function projectMetadata({
  body,
  project,
  selectedIds,
}) {
  const requested = requestMetadata(body);
  return {
    ...(project.metadata || {}),
    ...requested,
    creative_solution_source: "DIRECTOR_RESOLVED_FROM_CONTEXT",
    selected_asset_ids: selectedIds,
    selected_assets_locked_at: new Date().toISOString(),
    selected_assets_source:
      requested.asset_selection?.source ||
      "creative_create_command",
    command_boundary_media_inference: false,
    command_boundary_channel_inference: false,
    command_boundary_specialist_preprocessing: false,
  };
}

function requestedOutputs(body = {}) {
  return [...new Set([
    ...normalizeList(
      body.requestedOutputs || body.requested_outputs,
    ),
    ...normalizeList(body.channels || body.target_channels),
    ...normalizeList(body.production_type),
  ])];
}

export async function POST(request) {
  try {
    const incoming = await request.json();
    const organizationId =
      incoming.organization_id || incoming.organizationId || null;

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

    const command = normalizeCreativeCommand(
      incoming,
      access.organization || {},
    );
    const resolved = await resolveSelectedAssets({
      organizationId,
      organization: access.organization || command.organization || {},
      body: command,
    });
    const assets = resolved.assets;
    const selectedIds = assets.map((asset) => asset.id);
    const body = {
      ...command,
      selected_asset_ids: selectedIds,
      metadata: {
        ...object(command.metadata),
        asset_selection: resolved.selection,
      },
    };

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
    if (
      !project ||
      String(project.organization_id) !== String(organizationId)
    ) {
      throw new Error("Creative project not found");
    }

    const attachedAssetNodes =
      await CreativeAssetGraphRepository.attachAssetsToProject({
        organization_id: organizationId,
        creative_project_id: creativeProjectId,
        creative_asset_ids: selectedIds,
      });
    if (attachedAssetNodes.length < selectedIds.length) {
      throw new Error(
        "CREATIVE_SELECTED_ASSET_NODE_ATTACHMENT_INCOMPLETE",
      );
    }

    const metadata = projectMetadata({
      body,
      project,
      selectedIds,
    });
    const updatedProject = await CreativeProjectRuntime.update(
      creativeProjectId,
      { metadata },
    );

    const execution = await CreativeDirectorRuntime.execute({
      organization_id: organizationId,
      creative_mission_id: started.id,
      creative_project_id: creativeProjectId,
      creative_brief_id: creativeBriefId,
      mission: started,
      project: updatedProject,
      objective:
        started.objective ||
        started.business_goal ||
        body.intent ||
        "",
      business_goal:
        started.business_goal ||
        started.objective ||
        body.intent ||
        "",
      audience: started.audience || {},
      assets,
      requestedOutputs: requestedOutputs(body),
      organization: body.organization || access.organization || {},
      brand: body.brand || {},
    });

    const productionStatus =
      execution.production?.post_production?.status ||
      execution.production?.status ||
      "PRODUCTION_STARTED";
    const approvalRequired = [
      "PRODUCTION_DOSSIER_APPROVAL_REQUIRED",
      "READY_FOR_APPROVAL",
      "WAITING_FOR_APPROVAL",
      "APPROVAL_REQUIRED",
    ].some((value) => String(productionStatus).includes(value));

    return Response.json({
      success: execution.success !== false,
      status:
        execution.skipped
          ? "ALREADY_COMPLETED"
          : productionStatus,
      command: {
        intent: body.intent,
        explicit_constraints: {
          production_type: body.production_type || null,
          target_duration: body.target_duration || null,
          channels: normalizeList(body.channels),
          requested_outputs: requestedOutputs(body),
        },
        creative_solution_source: "DIRECTOR_RESOLVED_FROM_CONTEXT",
        public_publish_authorized: false,
      },
      mission: started,
      creative_mission_id: started.id,
      creative_project_id: creativeProjectId,
      creative_brief_id: creativeBriefId,
      asset_selection: resolved.selection,
      selected_asset_ids: selectedIds,
      attached_asset_node_ids:
        attachedAssetNodes.map((node) => node.id),
      execution,
      next_action:
        approvalRequired ||
        execution.production?.post_production?.status ===
          "READY_FOR_APPROVAL"
          ? "REVIEW_AND_APPROVE_PRODUCTION_DOSSIER"
          : "RESUME_CREATIVE_PIPELINE",
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
        validation:
          error?.validation ||
          error?.cause?.validation ||
          null,
      },
      { status: 500 },
    );
  }
}
