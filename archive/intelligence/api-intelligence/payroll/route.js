import { NextResponse } from "next/server";

import buildPayrollIntelligence from "@/lib/intelligence/payroll/buildPayrollIntelligence";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildPayrollIntelligence(
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
