export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { planRecurringAccountingCycles, clampRecurringHorizonDays } from "@/lib/finance/practice/recurringCyclePlanner";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

async function requireFinanceView(access) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.view",
    fullAccess: access.permissions?.includes("*") === true,
  });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = clean(searchParams.get("organizationId") || searchParams.get("organization_id"));
    const horizonDays = clampRecurringHorizonDays(searchParams.get("days"));

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireFinanceView(access);

    const plan = await planRecurringAccountingCycles({
      accountingFirmId: access.organizationId,
      horizonDays,
    });

    return NextResponse.json({
      success: true,
      mode: "DRY_RUN",
      materialized: false,
      ...plan,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error?.message || "Unable to plan recurring accounting cycles";
    console.error("FINANCE_RECURRING_PLAN_FAILED", error);
    return jsonError(message, /permission denied/i.test(message) ? 403 : 500);
  }
}
