export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadPeriodCloseChecklist,
  runPeriodCloseStep,
} from "@/lib/finance/period-close/runtime/PeriodCloseStepApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = required(
      searchParams.get("organization_id") || searchParams.get("organizationId"),
      "organization_id"
    );
    const access = await requireOrganizationAccess({ organizationId });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await loadPeriodCloseChecklist({
      organizationId: access.organizationId,
      entityId: required(
        searchParams.get("entity_id") || searchParams.get("entityId"),
        "entity_id"
      ),
      periodId: required(
        searchParams.get("period_id") || searchParams.get("periodId"),
        "period_id"
      ),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Period close checklist failed";
    const status = /required|outside|closed|locked/i.test(message) ? 400 : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = required(
      body.organization_id || body.organizationId,
      "organization_id"
    );
    const access = await requireOrganizationAccess({ organizationId });

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
      entityId: required(body.entity_id || body.entityId, "entity_id"),
      periodId: required(body.period_id || body.periodId, "period_id"),
      stepType: required(body.step_type || body.stepType, "step_type"),
      completedBy: access.user?.id || null,
      idempotencyKey: required(
        body.idempotency_key ||
          body.idempotencyKey ||
          request.headers.get("idempotency-key"),
        "idempotency_key"
      ),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error.message || "Period close step failed";
    const status = /required|invalid|outside|closed|locked|configured|incomplete|failed/i.test(message)
      ? 400
      : 500;
    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
