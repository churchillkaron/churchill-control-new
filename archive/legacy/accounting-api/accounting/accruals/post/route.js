import { NextResponse } from "next/server";

import { postAccrualEntry } from "@/lib/finance/core/postAccrualEntry";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const accrual =
      await postAccrualEntry({
        tenantId:
          body.tenantId,
        accrualType:
          body.accrualType,
        referenceType:
          body.referenceType,
        referenceId:
          body.referenceId,
        debitAccount:
          body.debitAccount,
        creditAccount:
          body.creditAccount,
        amount:
          body.amount,
        accrualDate:
          body.accrualDate,
        reversalDate:
          body.reversalDate,
      });

    return NextResponse.json({
      success: true,
      accrual,
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
