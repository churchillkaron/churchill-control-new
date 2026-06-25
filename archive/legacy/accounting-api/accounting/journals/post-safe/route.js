import { NextResponse } from "next/server";

import { postJournalEntrySafe } from "@/lib/finance/accounting/postJournalEntrySafe";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await postJournalEntrySafe({
        tenantId: body.tenantId,
        entryDate: body.entryDate,
        description: body.description,
        reference: body.reference,
        lines: body.lines,
      });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      {
        status: 400,
      }
    );
  }
}
