export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { runIntercompanyReconciliationCommand } from "@/lib/finance/intercompany/runtime/IntercompanyApplicationService";

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
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId,
    });

    if (!entity) {
      throw new Error("Legal entity not found in organisation");
    }

    const sourceBalance = Number(
      body.sourceBalance ?? body.source_balance
    );
    const targetBalance = Number(
      body.targetBalance ?? body.target_balance
    );

    if (!Number.isFinite(sourceBalance) || !Number.isFinite(targetBalance)) {
      throw new Error("source_balance and target_balance must be numeric");
    }

    const result = await runIntercompanyReconciliationCommand({
      organizationId: access.organizationId,
      entityId: entity.id,
      transactionId: required(
        body.transactionId || body.transaction_id,
        "transaction_id"
      ),
      sourceBalance,
      targetBalance,
    });

    return NextResponse.json({ success: true, reconciliation: result });
  } catch (error) {
    const message = error.message || "Intercompany reconciliation failed";
    const status = /required|not found|not part|numeric/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
