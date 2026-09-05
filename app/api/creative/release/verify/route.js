export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePublicationVerificationRuntime,
} from "@/lib/creative/release/runtime/CreativePublicationVerificationRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const publishCommandAssetNodeId =
      body.publish_command_asset_node_id ||
      body.publishCommandAssetNodeId;
    const action = String(body.action || "verify").trim().toLowerCase();

    if (!organizationId || !publishCommandAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and publish_command_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.release.publish",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const input = {
      organization_id: organizationId,
      publish_command_asset_node_id: publishCommandAssetNodeId,
    };
    const result = action === "inspect"
      ? await CreativePublicationVerificationRuntime.inspect(input)
      : await CreativePublicationVerificationRuntime.verify({
          ...input,
          verified_by: {
            user_id: access.userId,
            staff_account_id: access.staff?.id,
          },
        });

    return Response.json({ success: true, result });
  } catch (error) {
    const message = error?.message || String(error);
    const conflict = [
      "REMOTE_PUBLICATION_NOT_OBSERVED_YET",
      "REMOTE_PUBLICATION_ACKNOWLEDGEMENT_REQUIRED",
      "REMOTE_PUBLICATION_ID_REQUIRED",
      "PUBLICATION_REMOTE_VERIFICATION_UNSUPPORTED",
      "PUBLICATION_REMOTE_VERIFICATION_CREDENTIAL_REQUIRED",
      "STALE_PUBLISH_COMMAND_MASTER_VERSION",
      "STALE_PUBLISH_COMMAND_RELEASE_READINESS",
      "STALE_PUBLISH_COMMAND_APPROVAL",
    ].some((code) => message.includes(code));
    return Response.json(
      { success: false, error: message },
      { status: conflict ? 409 : 500 },
    );
  }
}
