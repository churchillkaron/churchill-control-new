export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { settleIntercompanyTransactionCommand } from "@/lib/finance/intercompany/runtime/IntercompanyApplicationService";

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

    const requestedEntityId = required(
      body.entityId || body.entity_id,
      "entity_id"
    );
    const entity = await resolveEntity({
      organizationId: access.organizationId,
      entityId: requestedEntityId,
    });

    if (!entity) {
      throw new Error("Legal entity not found in organisation");
    }

    const result = await settleIntercompanyTransactionCommand({
      organization_id: access.organizationId,
      entity_id: entity.id,
      transaction_id: required(
        body.transactionId || body.transaction_id,
        "transaction_id"
      ),
      settled_by: user?.id || access.user?.id || null,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Intercompany settlement failed";
    return NextResponse.json(
      { success: false, error: message },
      {
        status: /required|not found|not part|status|reconciliation|cannot|not applied/i.test(message)
          ? 400
          : 500,
      }
    );
  }
}
