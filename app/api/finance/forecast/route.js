export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  buildRevenueForecastCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

export async function POST(request) {
  try {
    const user = await requireAuth();
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

    const result = await buildRevenueForecastCommand({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
      periodId: body.periodId || body.period_id || null,
      sourceStartDate: body.source_start_date || body.sourceStartDate || null,
      sourceEndDate: body.source_end_date || body.sourceEndDate || null,
      horizonDays: body.horizon_days || body.horizonDays || 30,
      growthRatePercent:
        body.growth_rate_percent ?? body.growthRatePercent ?? 0,
      currencyCode: body.currency_code || body.currencyCode || null,
      idempotencyKey:
        body.idempotency_key ||
        body.idempotencyKey ||
        request.headers.get("idempotency-key"),
      createdBy: user?.id || access.user?.id || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Forecast generation failed";
    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|not found|must|cannot|configured|period|currency/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
