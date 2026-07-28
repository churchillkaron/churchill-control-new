export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeLocalMediaShortlistRuntime,
} from "@/lib/creative/media/runtime/CreativeLocalMediaShortlistRuntime";
import {
  CreativeBoundedShortlistVerificationRuntime,
} from "@/lib/creative/media/runtime/CreativeBoundedShortlistVerificationRuntime";
import {
  CreativeDenseSemanticPlanRuntime,
} from "@/lib/creative/media/runtime/CreativeDenseSemanticPlanRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function statusFor(error) {
  const message = text(error?.message).toUpperCase();
  if (message.includes("NOT_FOUND")) return 404;
  if (message.includes("AUTHORIZATION")) return 403;
  if (
    message.includes("REQUIRED") ||
    message.includes("INVALID") ||
    message.includes("MISMATCH") ||
    message.includes("EXCEEDED") ||
    message.includes("BLOCKING") ||
    message.includes("RECONCILIATION") ||
    message.includes("PREFLIGHT")
  ) return 400;
  return 500;
}

async function requireProject({ organizationId, projectId }) {
  const project = await CreativeProjectRuntime.get(projectId);
  if (!project || String(project.organization_id) !== String(organizationId)) {
    throw new Error("CREATIVE_SHORTLIST_PROJECT_NOT_FOUND");
  }
  return project;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(
      body.organization_id || body.organizationId,
    );
    const projectId = text(
      body.creative_project_id || body.creativeProjectId,
    );
    const action = text(body.action).toUpperCase();

    if (!organizationId) throw new Error("organization_id required");
    if (!projectId) throw new Error("creative_project_id required");
    if (![
      "ANALYZE_SOURCE",
      "FINALIZE",
      "DENSE_PREFLIGHT",
      "VERIFY",
      "STATUS",
    ].includes(action)) {
      throw new Error("CREATIVE_SHORTLIST_ACTION_INVALID");
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.asset.upload",
        "creative.execute",
        "creative.production.run",
      ],
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const project = await requireProject({
      organizationId,
      projectId,
    });
    const policy = object(body.policy);
    let result;

    if (action === "ANALYZE_SOURCE") {
      const sourceNodeId = text(
        body.parent_asset_node_id ||
        body.source_asset_node_id ||
        body.parentAssetNodeId ||
        body.sourceAssetNodeId,
      );
      if (!sourceNodeId) {
        throw new Error("parent_asset_node_id required");
      }
      result = await CreativeLocalMediaShortlistRuntime.analyzeSource({
        organization_id: organizationId,
        parent_asset_node_id: sourceNodeId,
        policy,
        force: body.force === true,
      });
    } else if (action === "FINALIZE") {
      result = await CreativeLocalMediaShortlistRuntime.finalizeProject({
        organization_id: organizationId,
        creative_project_id: projectId,
        policy,
        country: body.country || null,
        currency: body.currency || null,
      });
      await CreativeProjectRuntime.update(projectId, {
        metadata: {
          ...object(project.metadata),
          local_shortlist_status: "AWAITING_DENSE_PREFLIGHT",
          project_shortlist_identity:
            result.project_shortlist_identity,
          local_shortlist_candidate_count:
            result.selected_candidate_count,
          local_shortlist_estimated_ai_calls:
            result.estimated_ai_calls,
          local_shortlist_cost_estimate:
            result.cost_estimate,
          paid_analysis_authorized: false,
          paid_production_authorized: false,
          production_started_by_shortlist: false,
          local_shortlist_finalized_at: new Date().toISOString(),
        },
      });
    } else if (action === "DENSE_PREFLIGHT") {
      result = await CreativeDenseSemanticPlanRuntime.preflight({
        organization_id: organizationId,
        creative_project_id: projectId,
        policy,
        country: body.country || null,
        currency: body.currency || null,
      });
      await CreativeProjectRuntime.update(projectId, {
        metadata: {
          ...object(project.metadata),
          local_shortlist_status: result.ready
            ? "AWAITING_DENSE_AUTHORIZATION"
            : "DENSE_PREFLIGHT_BLOCKED",
          dense_semantic_plan_identity:
            result.dense_semantic_plan_identity,
          dense_semantic_estimated_ai_calls:
            result.estimated_ai_calls,
          dense_semantic_cost_estimate:
            result.cost_estimate,
          dense_semantic_candidate_plans:
            result.candidate_plans,
          dense_semantic_preflight_ready: result.ready,
          dense_semantic_preflight_reasons: result.reasons,
          paid_analysis_authorized: false,
          paid_production_authorized: false,
          production_started_by_shortlist: false,
          dense_semantic_preflight_at: new Date().toISOString(),
        },
      });
    } else if (action === "VERIFY") {
      throw new Error(
        "LEGACY_TWO_FRAME_VERIFICATION_DISABLED:DENSE_SEMANTIC_EXECUTION_REQUIRED",
      );
    } else {
      result = await CreativeLocalMediaShortlistRuntime.status({
        organization_id: organizationId,
        creative_project_id: projectId,
      });
    }

    return Response.json({
      success: true,
      action,
      creative_project_id: projectId,
      production_started: false,
      ...result,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
      validation:
        error?.validation || error?.cause?.validation || null,
      production_started: false,
    }, { status: statusFor(error) });
  }
}
