export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { requestJournalReversalCommand } from "@/lib/finance/general-ledger/runtime/GeneralLedgerApplicationService";

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
        "finance.journals.reverse",
        "finance.general-ledger.reverse",
        "finance.*",
      ],
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
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
        { success: false, error: "Legal entity not found in organisation" },
        { status: 404 }
      );
    }

    const result = await requestJournalReversalCommand({
      organizationId: access.organizationId,
      entityId: entity.id,
      journalId: required(
        body.journalId || body.journal_id,
        "journal_id"
      ),
      reason: required(body.reason, "reason"),
      requestedBy: required(access.user?.id, "authenticated user"),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Journal reversal request failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: /required|not found|already|pending|reversed/i.test(message) ? 400 : 500 }
    );
  }
}
