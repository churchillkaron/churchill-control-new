export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import {
  runCashFlowCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "cash_flow",
      operation: "read",
      access,
    });

    const cashFlow = await runCashFlowCommand({
      ...body,
      organizationId: access.organizationId,
      organization_id: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
      periodId: body.periodId || body.period_id || null,
    });

    return NextResponse.json({
      success: true,
      cashFlow,
      rows: Array.isArray(cashFlow) ? cashFlow : cashFlow?.rows || [],
    });
  } catch (error) {
    const message = error.message || "Cash flow execution failed";
    const status = /permission denied/i.test(message) ? 403 : 500;
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status }
    );
  }
}
