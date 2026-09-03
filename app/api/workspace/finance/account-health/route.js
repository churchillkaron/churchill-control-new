export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { loadFinanceAccountHealthRuntime } from "@/lib/finance/ui/loadFinanceAccountHealthRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function clean(value) { return String(value ?? "").trim(); }
function statusFor(message) {
  if (/permission denied/i.test(message || "")) return 403;
  if (/required|context/i.test(message || "")) return 400;
  return 500;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const entityId = clean(url.searchParams.get("entityId") || url.searchParams.get("entity_id"));
    const periodId = clean(url.searchParams.get("periodId") || url.searchParams.get("period_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });

    await checkFinancePermission({ organizationId: access.organizationId, userId: access.user?.id, permissionKey: "finance.accounting.view", fullAccess: access.permissions?.includes("*") === true });
    const context = await resolveBusinessContext({ organizationId: access.organizationId, entityId: entityId || null, periodId: periodId || null, request, access });
    if (!context.success) return NextResponse.json({ success: false, error: context.error }, { status: context.status || 400 });

    const result = await loadFinanceAccountHealthRuntime({
      organizationId: context.organizationId,
      entityId: context.entityId,
      periodId: context.periodId,
      period: context.period,
      currency: context.currency || null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error?.message || "Unable to load Finance account health";
    console.error("FINANCE_ACCOUNT_HEALTH_FAILED", error);
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
