import { NextResponse } from "next/server";

import buildAIAccountingReconciliation from "@/lib/intelligence/accounting/reconciliation/buildAIAccountingReconciliation";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAIAccountingReconciliation(
        body
      );

    return NextResponse.json(
      result
    );

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error:
          error.message,
      },
      {
        status: 500,
      }
    );
  }
}
