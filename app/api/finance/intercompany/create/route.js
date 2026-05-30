import { NextResponse } from "next/server";

import { createIntercompanyTransaction } from "@/lib/finance/core/createIntercompanyTransaction";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const transaction =
      await createIntercompanyTransaction({
        tenantId:
          body.tenantId,
        sourceEntity:
          body.sourceEntity,
        targetEntity:
          body.targetEntity,
        transactionType:
          body.transactionType,
        referenceNumber:
          body.referenceNumber,
        amount:
          body.amount,
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
