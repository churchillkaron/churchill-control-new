import { NextResponse } from "next/server";

import generateTrialBalance from "@/lib/finance/reports/generateTrialBalance";

import generateProfitLoss from "@/lib/finance/reports/generateProfitLoss";

import generateBalanceSheet from "@/lib/finance/reports/generateBalanceSheet";

export async function POST(req) {

  try {

    const body =
      await req.json();


    if (!body.tenant_id) {

      return NextResponse.json(
        {
          success: false,
          error: "Missing tenant_id",
        },
        {
          status: 400,
        }
      );

    }

    const tenant_id =
      body.tenant_id;

    const [
      trialBalance,
      profitLoss,
      balanceSheet,
    ] = await Promise.all([

      generateTrialBalance({
        tenant_id,
      }),

      generateProfitLoss({
        tenant_id,
      }),

      generateBalanceSheet({
        tenant_id,
      }),
    ]);

    return NextResponse.json({

      success: true,

      trialBalance,

      profitLoss,

      balanceSheet,
    });

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
