export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CreativeBrandBootstrapRuntime } from "@/lib/creative/brand/runtime/CreativeBrandBootstrapRuntime";

function text(value) { return String(value ?? "").trim(); }

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organizationId || body.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status || 403 });
    const result = await CreativeBrandBootstrapRuntime.bootstrap({
      organizationId: access.organizationId,
      primaryLogoAssetId: text(body.primaryLogoAssetId || body.primary_logo_asset_id) || null,
      logoIconAssetId: text(body.logoIconAssetId || body.logo_icon_asset_id) || null,
    });
    return Response.json({ success:true, ...result });
  } catch (error) {
    return Response.json({ success:false, error:error?.message || "Brand bootstrap failed" }, { status:500 });
  }
}
