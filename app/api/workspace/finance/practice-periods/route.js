export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { openAccountingPeriodCommand } from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";
import { planRecurringAccountingCycles } from "@/lib/finance/practice/recurringCyclePlanner";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";

const MANAGE_PERMISSIONS = ["finance.accounting.manage", "finance.close.execute", "finance.configuration.manage"];

function clean(value) {
  return String(value ?? "").trim();
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ success: false, error: message, ...extra }, { status });
}

async function requireManage(access) {
  if (access.permissions?.includes("*") === true) return;
  let lastError = null;
  for (const permissionKey of MANAGE_PERMISSIONS) {
    try {
      await checkFinancePermission({
        organizationId: access.organizationId,
        userId: access.user?.id,
        permissionKey,
        fullAccess: false,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Finance client-period permission denied");
}

function periodName(candidate) {
  const value = clean(candidate?.start_at).slice(0, 10);
  return value ? value.slice(0, 7) : "Accounting period";
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organizationId || body.organization_id);
    const idempotencyKey = clean(body.idempotencyKey || body.idempotency_key);
    if (!idempotencyKey) return jsonError("idempotencyKey is required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return jsonError(access.error, access.status || 403);
    await requireManage(access);

    const plan = await planRecurringAccountingCycles({
      accountingFirmId: access.organizationId,
      horizonDays: 90,
    });
    const candidate = plan.candidates.find((row) => row.idempotency_key === idempotencyKey);
    if (!candidate) {
      return jsonError("Recurring accounting candidate is stale or unavailable", 409, {
        code: "RECURRING_CANDIDATE_STALE_OR_UNKNOWN",
      });
    }
    if (candidate.status !== "BLOCKED_PERIOD_CONFIGURATION") {
      return jsonError("Only a current missing-period blocker can create a client period", 409, {
        code: "RECURRING_PERIOD_NOT_REQUIRED",
      });
    }
    if (!candidate.organization_id || !candidate.entity_id || !candidate.start_at || !candidate.due_at) {
      return jsonError("Recurring period candidate is incomplete after server recomputation", 409);
    }
    const result = await openAccountingPeriodCommand({
      organizationId: candidate.organization_id,
      entityId: candidate.entity_id,
      name: periodName(candidate),
      startDate: clean(candidate.start_at).slice(0, 10),
      endDate: clean(candidate.due_at).slice(0, 10),
      createdBy: access.user?.id,
    });

    return NextResponse.json({
      success: true,
      period: result?.period || null,
      client_organization_id: candidate.organization_id,
      entity_id: candidate.entity_id,
      no_external_message: true,
    }, { status: 201 });
  } catch (error) {
    const message = error?.message || "Unable to create client accounting period";
    const status = /permission denied/i.test(message) ? 403
      : /overlap|period|required|entity|date|candidate|duplicate/i.test(message) ? 409
        : 500;
    return jsonError(message, status);
  }
}
