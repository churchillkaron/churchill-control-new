import { NextResponse } from "next/server";

import { postAutomaticJournal } from "@/lib/finance/core/postAutomaticJournal";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const journal =
      await postAutomaticJournal({
        tenantId:
          body.tenantId,
        journalDate:
          body.journalDate,
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
        description:
          body.description,
      });

    return NextResponse.json({
      success: true,
      journal,
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
