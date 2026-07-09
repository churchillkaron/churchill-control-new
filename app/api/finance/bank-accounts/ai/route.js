export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  analyzeBankAccountsCommand,
} from "@/lib/finance/bank-accounts/runtime/BankAccountsApplicationService";

export async function POST(request) {
  try {
    const body = await request.json();

    const organization_id =
      body.organization_id ||
      body.organizationId;

    const result =
      await analyzeBankAccountsCommand({
        organization_id,
      });

    return NextResponse.json(result);

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
