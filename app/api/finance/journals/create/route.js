export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { postJournalEntrySafe } from "@/lib/finance/general-ledger/capabilities/postJournalEntrySafe";

function required(value, field) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }

    const result = await postJournalEntrySafe({
      organizationId: access.organizationId,
      entityId: body.entityId || body.entity_id,
      postingDate: body.posting_date,
      documentDate: body.document_date,
      journalType: body.journal_type || "GENERAL",
      reference: body.reference,
      description: body.description,
      currencyCode: required(
        body.currency_code || body.currencyCode,
        "currency_code"
      ).toUpperCase(),
      exchangeRate: Number(body.exchange_rate || 1),
      lines: body.lines || [],
      createdBy: access.user?.id || null,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error.message || "Journal creation failed";
    const status = message.endsWith(" is required") ? 400 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
