export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { createBudgetDocument } from "@/lib/finance/budgeting/runtime/BudgetApplicationService";

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

    const budget = await createBudgetDocument({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
      periodId: body.periodId || body.period_id,
      accountId: body.accountId || body.account_id,
      category: body.category,
      amount: body.amount,
      month: body.month,
      year: body.year,
      currency: body.currency_code || body.currency,
      idempotencyKey:
        body.idempotency_key ||
        body.idempotencyKey ||
        request.headers.get("idempotency-key"),
      createdBy: user?.id || access.user?.id || null,
    });

    return NextResponse.json({ success: true, data: budget });
  } catch (error) {
    const message = error.message || "Budget creation failed";
    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|must|not found|closed|locked|match|currency/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
