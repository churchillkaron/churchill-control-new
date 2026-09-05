export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePublicationContentIntegrityRuntime,
} from "@/lib/creative/release/runtime/CreativePublicationContentIntegrityRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const publishCommandAssetNodeId =
      body.publish_command_asset_node_id ||
      body.publishCommandAssetNodeId;
    const action = String(body.action || "inspect").trim().toLowerCase();

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
    const result = action === "recheck"
      ? await CreativePublicationContentIntegrityRuntime.recheck({
          ...input,
          checked_by: {
            user_id: access.userId,
            staff_account_id: access.staff?.id,
          },
        })
      : await CreativePublicationContentIntegrityRuntime.inspect(input);

    return Response.json({ success: true, result });
  } catch (error) {
    const message = error?.message || String(error);
    const conflict = [
      "VERIFIED_PUBLICATION_HISTORY_REQUIRED",
      "PUBLICATION_LIFECYCLE_PROVIDER_UNSUPPORTED",
      "PUBLICATION_LIFECYCLE_CREDENTIAL_REQUIRED",
      "PUBLICATION_REMOTE_VERIFICATION_CREDENTIAL_REQUIRED",
      "REMOTE_PUBLICATION_ID_REQUIRED",
      "PUBLISH_EXECUTION_REQUIRED",
    ].some((code) => message.includes(code));
    return Response.json(
      { success: false, error: message },
      { status: conflict ? 409 : 500 },
    );
  }
}
