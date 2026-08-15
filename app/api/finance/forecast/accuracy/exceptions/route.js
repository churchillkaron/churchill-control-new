export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  buildForecastManagementExceptionsReportCommand,
  manageForecastExceptionCaseCommand,
} from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  if (/required|invalid|no longer active|resolved forecast/i.test(message)) return 400;
  return error?.status || 500;
}

async function requireFinancePermission(access, permissionKey) {
  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey,
    fullAccess: access.permissions?.includes("*") === true,
  });
}

async function canManage(access) {
  try {
    await requireFinancePermission(access, "finance.accounting.manage");
    return true;
  } catch (error) {
    if (String(error?.message || "").toLowerCase().includes("permission denied")) {
      return false;
    }
    throw error;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    await requireFinancePermission(access, "finance.accounting.view");

    const result = await buildForecastManagementExceptionsReportCommand({
      organizationId: access.organizationId,
      limit: searchParams.get("limit") || undefined,
    });

    return NextResponse.json({
      ...result,
      can_manage: await canManage(access),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Forecast management exceptions failed",
      },
      { status: statusFor(error) }
    );
  }
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

    await requireFinancePermission(access, "finance.accounting.manage");

    const report = await buildForecastManagementExceptionsReportCommand({
      organizationId: access.organizationId,
      limit: body.limit || undefined,
    });
    const occurrenceKey = String(body.occurrenceKey || body.occurrence_key || "").trim();
    const exception = (report.exceptions || []).find(
      item => item.occurrence_key === occurrenceKey
    );

    if (!exception) {
      throw new Error("Forecast exception is no longer active");
    }

    const caseRow = await manageForecastExceptionCaseCommand({
      organizationId: access.organizationId,
      exception,
      action: body.action,
      assignedTo: body.assignedTo || body.assigned_to,
      dueDate: body.dueDate || body.due_date,
      resolutionNote: body.resolutionNote || body.resolution_note,
      performedBy: access.user?.id,
      performedByName:
        access.staff?.name || access.user?.email || "Finance User",
    });

    return NextResponse.json({ success: true, case: caseRow });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Forecast exception action failed",
      },
      { status: statusFor(error) }
    );
  }
}
