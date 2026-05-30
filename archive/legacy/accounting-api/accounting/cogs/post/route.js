import { NextResponse } from "next/server";

import { postCOGSJournal } from "@/lib/finance/core/postCOGSJournal";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const entry =
      await postCOGSJournal({
        tenantId:
          body.tenantId,
        referenceType:
          body.referenceType,
        referenceId:
          body.referenceId,
        inventoryValue:
          body.inventoryValue,
        cogsValue:
          body.cogsValue,
      });

    return NextResponse.json({
      success: true,
      entry,
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
