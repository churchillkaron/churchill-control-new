export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  approveForecastScenarioVersionCommand,
  createForecastScenarioVersionDraft,
  listForecastScenarioVersionsCommand,
} from "@/lib/finance/budgeting/runtime/ForecastScenarioVersionService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  if (message.includes("not found")) return 404;
  if (message.includes("superseded")) return 409;
  if (/required|invalid|at least -100/i.test(message)) return 400;
  return error?.status || 500;
}

async function requireFinancePermission(access, permissionKey) {
  return await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey,
    fullAccess: access.permissions?.includes("*") === true,
  });
}

async function canManageFinance(access) {
  try {
    await requireFinancePermission(access, "finance.accounting.manage");
    return true;
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("permission denied")) return false;
    throw error;
  }
}

function actorName(access) {
  return access.user?.email || access.user?.user_metadata?.full_name || "Authenticated User";
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({ organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"), request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinancePermission(access, "finance.accounting.view");

    const [result, canManage] = await Promise.all([
      listForecastScenarioVersionsCommand({
        organizationId: access.organizationId,
        entityId: searchParams.get("entityId") || searchParams.get("entity_id"),
        periodId: searchParams.get("periodId") || searchParams.get("period_id"),
        scenarioKind: searchParams.get("scenarioKind") || searchParams.get("scenario_kind") || null,
      }),
      canManageFinance(access),
    ]);
    return NextResponse.json({ ...result, can_manage: canManage });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Forecast version listing failed" }, { status: statusFor(error) });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinancePermission(access, "finance.accounting.manage");

    const result = await createForecastScenarioVersionDraft({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
      periodId: body.periodId || body.period_id,
      scenarioKind: body.scenarioKind || body.scenario_kind,
      assumptions: body.assumptions,
      createdBy: access.user?.id,
      performedByName: actorName(access),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Forecast version creation failed" }, { status: statusFor(error) });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinancePermission(access, "finance.accounting.manage");

    const action = String(body.action || "").trim().toLowerCase();
    if (action !== "approve") throw new Error("Invalid forecast version action");

    const result = await approveForecastScenarioVersionCommand({
      organizationId: access.organizationId,
      versionId: body.versionId || body.version_id,
      approvedBy: access.user?.id,
      performedByName: actorName(access),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Forecast version update failed" }, { status: statusFor(error) });
  }
}
