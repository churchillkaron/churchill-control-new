export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { createIntercompanyTransactionCommand } from "@/lib/finance/intercompany/runtime/IntercompanyApplicationService";

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

    const result = await createIntercompanyTransactionCommand({
      organization_id: access.organizationId,
      from_legal_entity_id:
        body.from_legal_entity_id || body.source_entity_id,
      to_legal_entity_id:
        body.to_legal_entity_id || body.target_entity_id,
      transaction_type: body.transaction_type || null,
      transaction_date: body.transaction_date || null,
      reference_number: body.reference_number || null,
      description: body.description || null,
      amount: body.amount,
      currency: body.currency || body.currency_code || null,
      due_date: body.due_date || null,
      created_by: access.user?.id || null,
    });

    if (result?.success === false) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error.message || "Intercompany transaction creation failed";
    const status = /required|invalid|cannot|already|belong|currency/i.test(message)
      ? 400
      : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
