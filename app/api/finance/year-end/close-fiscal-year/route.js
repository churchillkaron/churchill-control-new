export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { runYearEndCloseCommand } from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";
import { recordFinanceClosePackageBaseline } from "@/lib/finance/period-close/runtime/FinanceClosePackageFreshness";

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

    let baseline;
    try {
      baseline = await recordFinanceClosePackageBaseline({
        organizationId: access.organizationId,
        entityId,
        periodId,
        closeType: "YEAR_END",
      });
    } catch (freshnessError) {
      console.error("FINANCE_YEAR_END_CLOSE_BASELINE_FAILED", {
        organizationId: access.organizationId,
        entityId,
        periodId,
        error: freshnessError,
      });
      return NextResponse.json(
        {
          success: false,
          closed: true,
          close_result: result,
          code: "FINANCE_CLOSE_FRESHNESS_BASELINE_UNPROVEN",
          error: "Year-end close completed, but Avantiqo could not certify the post-close accounting freshness baseline. Treat the close package as unproven until the freshness control is restored.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...result,
      package_freshness: {
        state: "CURRENT",
        trusted: true,
        fingerprint: baseline.fingerprint,
      },
    });
  } catch (error) {
    const message = error.message || "Year-end close failed";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
