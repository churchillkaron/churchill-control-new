export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeReleaseGateRuntime,
} from "@/lib/creative/quality/runtime/CreativeReleaseGateRuntime";

const POLICY_FIELDS = new Set([
  "require_rights_evidence",
  "require_consent",
  "allowed_usage",
  "channels",
  "territories",
  "required_identity_ids",
]);

function sanitizePolicy(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => POLICY_FIELDS.has(key)),
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const timelineAssetNodeId =
      body.timeline_asset_node_id ||
      body.timelineAssetNodeId;

    if (!organizationId || !timelineAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and timeline_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeReleaseGateRuntime.evaluate({
      organization_id: organizationId,
      timeline_asset_node_id: timelineAssetNodeId,
      policy: sanitizePolicy(body.policy || {}),
      force: body.force === true,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
