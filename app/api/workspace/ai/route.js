import { execute } from "@/lib/ubte";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();
    const capability = String(body?.capability || "").trim();
    const context = body?.context && typeof body.context === "object" ? body.context : {};
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
    const organizationId =
      context.organizationId ||
      context.organization_id ||
      payload.organizationId ||
      payload.organization_id ||
      null;

    if (!capability) {
      return Response.json(
        { success: false, error: "Workspace AI capability is required" },
        { status: 400 }
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return Response.json(access, { status: access.status || 403 });
    }

    return execute({
      capability,
      context: {
        ...context,
        organizationId,
        organization_id: organizationId,
      },
      payload: {
        ...payload,
        organizationId,
        organization_id: organizationId,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error?.message || "Workspace AI execution failed" },
      { status: 500 }
    );
  }
}
