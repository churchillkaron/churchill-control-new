export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { runPeriodCloseStep } from "@/lib/finance/period-close/runtime/PeriodCloseStepRouter";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
      requiredAnyPermission: [
        "finance.depreciation.run",
        "finance.fixed-assets.depreciate",
        "finance.*",
      ],
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await runPeriodCloseStep({
      ...body,
      organizationId: access.organizationId,
      organization_id: access.organizationId,
      entityId: required(body.entityId || body.entity_id, "entity_id"),
      periodId: required(body.periodId || body.period_id, "period_id"),
      stepType: "DEPRECIATION",
      completedBy: required(access.user?.id, "authenticated user"),
      idempotencyKey: required(
        body.idempotencyKey ||
          body.idempotency_key ||
          request.headers.get("idempotency-key"),
        "idempotency_key"
      ),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error.message || "Depreciation run failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|outside|closed|locked|configured|depreciation|asset/i.test(message) ? 400 : 500 }
    );
  }
}
