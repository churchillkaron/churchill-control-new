export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { runYearEndCloseCommand } from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  if (/required|period|step|journal|locked|outside/i.test(message || "")) return 400;
  return 500;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });

    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: access.user?.id,
      permissionKey: "finance.close.execute",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const periodId = required(body.periodId || body.period_id, "period_id");
    const idempotencyKey =
      body.idempotency_key ||
      body.idempotencyKey ||
      request.headers.get("idempotency-key") ||
      `year-end-close:${access.organizationId}:${entityId}:${periodId}`;

    const result = await runYearEndCloseCommand({
      organizationId: access.organizationId,
      entityId,
      periodId,
      requiredSteps: Array.isArray(body.required_steps) ? body.required_steps : undefined,
      closedBy: access.user.id,
      idempotencyKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Year-end close failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
