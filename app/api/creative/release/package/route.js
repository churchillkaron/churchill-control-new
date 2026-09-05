export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";
import {
  CreativeReleasePackageRuntime,
} from "@/lib/creative/release/runtime/CreativeReleasePackageRuntime";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const creativeProjectId = body.creative_project_id || body.creativeProjectId;

    if (!organizationId || !creativeProjectId) {
      return Response.json(
        { success: false, error: "organization_id and creative_project_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
      requiredPermission: "creative.quality.evaluate",
    });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeReleasePackageRuntime.certify({
      organization_id: organizationId,
      creative_project_id: creativeProjectId,
    });

    return Response.json({ success: true, result });
  } catch (error) {
    const message = error?.message || String(error);
    const blocked = /REQUIRED|INCOMPLETE/.test(message);
    return Response.json(
      { success: false, error: message },
      { status: blocked ? 409 : 500 },
    );
  }
}
