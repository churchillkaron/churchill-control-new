export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import {
  importBankStatementCommand,
  runBankReconciliationCommand,
} from "@/lib/finance/reconciliation/runtime/ReconciliationApplicationService";

function statusFor(message) {
  return String(message || "").toLowerCase().includes("permission denied") ? 403 : 500;
}

async function requireBankingManage(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return access;

  await checkFinancePermission({
    organizationId: access.organizationId,
    userId: access.user?.id,
    permissionKey: "finance.banking.manage",
    fullAccess: access.permissions?.includes("*") === true,
  });

  return access;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireBankingManage(
      request,
      body.organizationId || body.organization_id
    );

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const result = await importBankStatementCommand({
      organization_id: access.organizationId,
      transactions: Array.isArray(body.transactions) ? body.transactions : [],
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Bank statement import failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const access = await requireBankingManage(
      request,
      body.organizationId || body.organization_id
    );

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    const result = await runBankReconciliationCommand({
      organization_id: access.organizationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Bank reconciliation failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
