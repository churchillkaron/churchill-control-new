import { NextResponse } from "next/server";
import { reverseJournalEntry } from "@/lib/finance/core/reverseJournalEntry";

export async function POST(request) {
  try {
    const body = await request.json();

    const reversal = await reverseJournalEntry(body);

    return NextResponse.json({
      success: true,
      reversal,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: error.message,
    }, { status: 400 });
  }
}
