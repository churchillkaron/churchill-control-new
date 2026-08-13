export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { requestJournalReversalCommand } from "@/lib/finance/general-ledger/runtime/GeneralLedgerApplicationService";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "").toLowerCase();
  if (normalized.includes("permission denied")) return 403;
  return /required|not found|not posted|already|reversed|pending/i.test(normalized) ? 400 : 500;
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

    const actorId = required(access.user?.id, "authenticated user");
    await checkFinancePermission({
      organizationId: access.organizationId,
      userId: actorId,
      permissionKey: "finance.journals.reverse",
      fullAccess: access.permissions?.includes("*") === true,
    });

    const result = await requestJournalReversalCommand({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id || null,
      journalId: body.journalId || body.journal_id || body.id || null,
      reason: body.reason,
      reversalDate: body.reversalDate || body.reversal_date || null,
      requestedBy: actorId,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Reversal request failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: statusFor(message) }
    );
  }
}
