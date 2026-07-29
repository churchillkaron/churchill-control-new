export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requestJournalReversalCommand } from "@/lib/finance/general-ledger/runtime/GeneralLedgerApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();

    const access = await requireOrganizationAccess({
      organizationId:
        body.organizationId ||
        body.organization_id,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await requestJournalReversalCommand({
      organizationId: access.organizationId,
      entityId:
        body.entityId ||
        body.entity_id ||
        null,
      journalId:
        body.journalId ||
        body.journal_id ||
        body.id ||
        null,
      reason: body.reason,
      reversalDate:
        body.reversalDate ||
        body.reversal_date ||
        null,
      requestedBy:
        access.user?.id ||
        body.requestedBy ||
        body.requested_by ||
        "system",
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Reversal request failed";
    const status = /required|not found|not posted|already|reversed|pending/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
