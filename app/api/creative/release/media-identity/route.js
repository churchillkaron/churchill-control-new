export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativePublicationRemoteMediaIdentityRuntime,
} from "@/lib/creative/release/runtime/CreativePublicationRemoteMediaIdentityRuntime";

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
      ? await CreativePublicationRemoteMediaIdentityRuntime.recheck({
          ...input,
          checked_by: {
            user_id: access.userId,
            staff_account_id: access.staff?.id,
          },
        })
      : await CreativePublicationRemoteMediaIdentityRuntime.inspect(input);

    return Response.json({ success: true, result });
  } catch (error) {
    const message = error?.message || String(error);
    const conflict = [
      "VERIFIED_PUBLICATION_HISTORY_REQUIRED",
      "PUBLISH_EXECUTION_REQUIRED",
      "REMOTE_PUBLICATION_ID_REQUIRED",
      "REMOTE_MEDIA_IDENTITY_PROVIDER_UNSUPPORTED",
      "REMOTE_MEDIA_IDENTITY_CREDENTIAL_REQUIRED",
      "CERTIFIED_DERIVATIVE_MEDIA_REQUIRED",
      "CERTIFIED_DERIVATIVE_MEDIA_IDENTITY_REQUIRED",
    ].some((code) => message.includes(code));
    return Response.json(
      { success: false, error: message },
      { status: conflict ? 409 : 500 },
    );
  }
}
