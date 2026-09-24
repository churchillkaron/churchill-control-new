export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveBrand } from "@/lib/platform/documents/branding/BrandResolver";

function text(value) { return String(value ?? "").trim(); }

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status || 403 });
    const brand = await resolveBrand({ organizationId: access.organizationId, entityId: null });
    return Response.json({ success:true, brand });
  } catch (error) {
    return Response.json({ success:false, error:error?.message || "Unable to resolve brand" }, { status:500 });
  }
}
