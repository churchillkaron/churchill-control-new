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

function text(value) {
  return String(value || "").trim();
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(",")
    .map(text)
    .filter(Boolean);
}

function selectedAssetIds(body = {}) {
  return [...new Set(
    (Array.isArray(body.assets) ? body.assets : [])
      .map((asset) =>
        typeof asset === "string"
          ? text(asset)
          : text(asset?.asset_id || asset?.id),
      )
      .filter(Boolean),
  )];
}

async function resolveSelectedAssets({ organizationId, body }) {
  const ids = selectedAssetIds(body);
  const assets = [];

  for (const id of ids) {
    const asset = await CreativeAssetsRuntime.get(id);
    if (!asset || String(asset.organization_id) !== String(organizationId)) {
      throw new Error(`CREATIVE_SELECTED_ASSET_NOT_FOUND:${id}`);
    }
    if (asset.archived === true) {
      throw new Error(`CREATIVE_SELECTED_ASSET_ARCHIVED:${id}`);
    }
    assets.push(asset);
  }

  return assets;
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
    audience:
      body.audience && typeof body.audience === "object"
        ? body.audience
        : {},
    channels: normalizeList(body.channels || body.target_channels),
    metadata: {
      ...(body.metadata || {}),
      source: "natural_language_creative_intent",
      production_type:
        body.production_type || body.productionType || null,
      target_duration:
        Number(body.target_duration || body.duration_seconds || 30),
      target_languages: normalizeList(
        body.target_languages || body.languages || ["en"],
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
      context:
        body.context && typeof body.context === "object"
          ? body.context
          : {},
      original_intent: intent,
      selected_asset_ids: selectedAssetIds(body),
    },
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
    await CreativeProjectRuntime.update(creativeProjectId, {
      metadata: {
        ...(project.metadata || {}),
        selected_asset_ids: selectedIds,
        selected_assets_locked_at: new Date().toISOString(),
        selected_assets_source: "creative_create_command",
      },
    });

    const execution = await CreativeDirectorRuntime.execute({
      organization_id: organizationId,
      creative_mission_id: started.id,
      creative_project_id: creativeProjectId,
      creative_brief_id: creativeBriefId,
      mission: started,
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
