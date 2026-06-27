import { NextResponse } from "next/server";
import createIntercompanyTransaction from "@/lib/finance/intercompany/documents/createIntercompanyTransaction";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await createIntercompanyTransaction({
        organization_id: body.organization_id,
        from_legal_entity_id: body.from_legal_entity_id,
        to_legal_entity_id: body.to_legal_entity_id,
        transaction_type: body.transaction_type,
        reference_number: body.reference_number,
        description: body.description,
        amount: body.amount,
        currency: body.currency,
        due_date: body.due_date,
        created_by: body.created_by,
      });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
