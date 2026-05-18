import { NextResponse } from "next/server";

import closeAccountingPeriod from "@/lib/finance/period-close/closeAccountingPeriod";

import runYearEndClose from "@/lib/finance/year-end/runYearEndClose";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await closeAccountingPeriod(
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

export async function PUT(req) {

  try {

    const body =
      await req.json();

    const result =
      await runYearEndClose({

        tenant_id:
          body.tenant_id,

        fiscal_year:
          body.fiscal_year,
      });

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
