import { NextResponse } from "next/server";
import { postJournalEntry } from "@/lib/finance/postJournalEntry";

export async function POST(request) {
  try {
    const body = await request.json();

    const journal = await postJournalEntry({
      tenantId: body.tenantId,
      entryDate: body.entryDate,
      description: body.description,
      reference: body.reference,
      lines: body.lines,
    });

    return NextResponse.json({
      success: true,
      journal,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error.message,
      },
      { status: 400 }
    );
  }
}
