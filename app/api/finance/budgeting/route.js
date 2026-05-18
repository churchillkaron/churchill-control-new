import { NextResponse } from "next/server";

import createBudget from "@/lib/finance/budgeting/createBudget";

import generateFinancialForecast from "@/lib/finance/forecasting/generateFinancialForecast";

import runVarianceAnalysis from "@/lib/finance/variance-analysis/runVarianceAnalysis";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createBudget(
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
      await generateFinancialForecast({

        tenant_id:
          body.tenant_id,
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

export async function PATCH(req) {

  try {

    const body =
      await req.json();

    const result =
      await runVarianceAnalysis({

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
