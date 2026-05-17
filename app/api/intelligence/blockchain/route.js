import { NextResponse } from "next/server";

import buildAuditBlockchainLedger from "@/lib/intelligence/blockchain/buildAuditBlockchainLedger";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAuditBlockchainLedger(
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
