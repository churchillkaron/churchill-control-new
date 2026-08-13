export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { updateFixedAssetCommand } from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";

function cleanValues(values) {
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const {
    organization_id,
    organizationId,
    tenant_id,
    tenantId,
    id,
    ...safeValues
  } = values;
  return safeValues;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|invalid|not found/i.test(message || "") ? 400 : 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.accounting.manage",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await updateFixedAssetCommand({
      ...body,
      organization_id: access.organizationId,
      values: cleanValues(body.values),
    });

    return NextResponse.json({ success: true, asset: result });
  } catch (error) {
    const message = error.message || "Fixed asset update failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
