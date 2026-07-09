export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  upsertBankAccountCommand,
} from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();

    const result =
      await upsertBankAccountCommand(body);

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
