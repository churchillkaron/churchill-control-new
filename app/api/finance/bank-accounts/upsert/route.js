export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import upsertBankAccountCapability from "@/lib/finance/bank-accounts/capabilities/upsertBankAccount";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await upsertBankAccountCapability(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
