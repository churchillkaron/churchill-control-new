export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { AccountsPayableApplicationService } from "@/lib/finance/accounts-payable/runtime/AccountsPayableApplicationService";

export async function POST(req) {
  try {

    const body = await req.json();

    const result = await AccountsPayableApplicationService({
      type: body.type,
      payload: body
    });

    return NextResponse.json(result);

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message
      },
      { status: 500 }
    );

  }
}
