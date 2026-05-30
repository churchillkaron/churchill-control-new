import { NextResponse } from "next/server";

import { importBankTransaction } from "@/lib/finance/core/importBankTransaction";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const transaction =
      await importBankTransaction({
        tenantId:
          body.tenantId,
        bankAccountId:
          body.bankAccountId,
        transactionDate:
          body.transactionDate,
        reference:
          body.reference,
        description:
          body.description,
        amount:
          body.amount,
        transactionType:
          body.transactionType,
      });

    return NextResponse.json({
      success: true,
      transaction,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
