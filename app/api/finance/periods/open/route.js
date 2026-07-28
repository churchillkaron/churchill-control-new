export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  openAccountingPeriodCommand,
} from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

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

    const result = await openAccountingPeriodCommand({
      organizationId: access.organizationId,
      entityId: required(body.entityId || body.entity_id, "entity_id"),
      name: required(body.name, "name"),
      startDate: required(body.start_date || body.startDate, "start_date"),
      endDate: required(body.end_date || body.endDate, "end_date"),
      createdBy: user?.id || access.user?.id || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Accounting period creation failed";
    const status = /required|valid date|cannot be|overlap|not found/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
