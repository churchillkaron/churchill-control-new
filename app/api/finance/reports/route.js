import { NextResponse } from "next/server";

import generateTrialBalance from "@/lib/finance/reports/generateTrialBalance";

import generateProfitLoss from "@/lib/finance/reports/generateProfitLoss";

import generateBalanceSheet from "@/lib/finance/reports/generateBalanceSheet";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(req) {

  try {

    const body =
      await req.json();


    const access =
      await requireOrganizationAccess({
        organizationId:
          body.organizationId,
      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenant_id =
      access.tenantId;

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
