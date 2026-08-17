export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { listForecastOverrideReviewCases } from "@/lib/finance/budgeting/repositories/ForecastExceptionCaseRepository";
import { managePersistedForecastExceptionCaseCommand } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

function statusFor(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("permission denied")) return 403;
  if (message.includes("not found")) return 404;
  if (
    /required|invalid|resolved forecast|assign the override review|set a due date for the override review|acknowledge the override review/i.test(
      message
    )
  ) {
    return 400;
  }
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
    if (String(error?.message || "").toLowerCase().includes("permission denied")) return false;
    throw error;
  }
}

function actorName(access) {
  return access.staff?.name || access.user?.email || "Finance User";
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
    const reviews = await listForecastOverrideReviewCases({
      organizationId: access.organizationId,
    });

    return NextResponse.json({
      success: true,
      reviews,
      can_manage: await canManage(access),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Forecast override review listing failed",
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

    const caseRow = await managePersistedForecastExceptionCaseCommand({
      organizationId: access.organizationId,
      occurrenceKey: body.occurrenceKey || body.occurrence_key,
      requiredExceptionType: "APPROVAL_OVERRIDE_REVIEW",
      action: body.action,
      assignedTo: body.assignedTo || body.assigned_to,
      dueDate: body.dueDate || body.due_date,
      resolutionNote: body.resolutionNote || body.resolution_note,
      performedBy: access.user?.id,
      performedByName: actorName(access),
    });

    return NextResponse.json({ success: true, case: caseRow });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Forecast override review action failed",
      },
      { status: statusFor(error) }
    );
  }
}
