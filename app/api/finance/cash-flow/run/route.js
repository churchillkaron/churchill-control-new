export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  runCashFlowCommand,
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
      request,
      requiredAnyPermission: [
        "finance.cash-flow.run",
        "finance.reporting.run",
        "finance.*",
      ],
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const entityId = required(
      body.entityId || body.entity_id,
      "entity_id"
    );
    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "Legal entity not found in organisation", rows: [] },
        { status: 404 }
      );
    }

    const periodId = required(
      body.periodId || body.period_id,
      "period_id"
    );

    const cashFlow = await runCashFlowCommand({
      organizationId: access.organizationId,
      entityId: entity.id,
      periodId,
    });

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      entity_id: entity.id,
      period_id: periodId,
      cashFlow,
      rows: [cashFlow],
    });
  } catch (error) {
    const message = error.message || "Cash flow execution failed";
    return NextResponse.json(
      { success: false, error: message, rows: [] },
      { status: /required|not found|scope/i.test(message) ? 400 : 500 }
    );
  }
}
