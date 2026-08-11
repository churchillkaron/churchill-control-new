export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import * as CreativeAssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import {
  CreativeApprovalRuntime,
} from "@/lib/creative/release/runtime/CreativeApprovalRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function newest(nodes = []) {
  return [...nodes].sort((left, right) =>
    Date.parse(right.updated_at || right.created_at || 0) -
    Date.parse(left.updated_at || left.created_at || 0),
  )[0] || null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(
      url.searchParams.get("organization_id") ||
      url.searchParams.get("organizationId"),
    );
    const creativeProjectId = text(
      url.searchParams.get("creative_project_id") ||
      url.searchParams.get("creativeProjectId") ||
      url.searchParams.get("project_id"),
    );

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and creative_project_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredAnyPermission: [
        "creative.*",
        "creative.execute",
        "creative.production.run",
        "creative.release.approve",
      ],
    });

    if (!access.success) {
      return Response.json(access, { status: access.status || 403 });
    }

    const nodes = await CreativeAssetGraphRepository.listByProject({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
    });

    const dossier = newest(
      nodes.filter((node) =>
        node.type === CREATIVE_ASSET_NODE_TYPES.PRODUCTION_DOSSIER &&
        node.status !== CREATIVE_ASSET_NODE_STATUS.ARCHIVED,
      ),
    );

    if (!dossier) {
      return Response.json({
        success: true,
        dossier: null,
        approval: null,
        status: "PLANNING",
      });
    }

    const approval = await CreativeApprovalRuntime.findCurrentApproval({
      organization_id: organizationId,
      subject_asset_node_id: dossier.id,
      scope: "PRODUCTION_DOSSIER",
    });

    return Response.json({
      success: true,
      dossier,
      approval,
      status: approval ? "APPROVED" : "AWAITING_APPROVAL",
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
