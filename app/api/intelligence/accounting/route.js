import { NextResponse } from "next/server";

import buildAccountingIntelligence from "@/lib/intelligence/accounting/buildAccountingIntelligence";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildAccountingIntelligence(
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
