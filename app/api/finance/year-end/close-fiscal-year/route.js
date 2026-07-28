export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  runYearEndCloseCommand,
} from "@/lib/finance/period-close/runtime/PeriodCloseApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} required`);
  }

  return normalized;
}

export async function POST(request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
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

    const confirmation = required(body.confirmation, "confirmation").toUpperCase();
    if (confirmation !== "CLOSE YEAR") {
      throw new Error("confirmation must be CLOSE YEAR");
    }

    const result = await runYearEndCloseCommand({
      organizationId: access.organizationId,
      entityId: required(
        body.entityId || body.entity_id,
        "entity_id"
      ),
      periodId: required(
        body.periodId || body.period_id,
        "period_id"
      ),
      requiredSteps: Array.isArray(body.required_steps)
        ? body.required_steps
        : undefined,
      closedBy: user?.id || access.user?.id || null,
      idempotencyKey: required(
        body.idempotency_key ||
          body.idempotencyKey ||
          request.headers.get("idempotency-key"),
        "idempotency_key"
      ),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error.message ||
      "Year-end close failed";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      {
        status: /required|period|step|journal|locked|confirmation/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
