import {
  requireAuth,
} from "@/lib/shared/auth";

import { NextResponse }
from "next/server";

import generateMonthlyPayroll
from "@/lib/payroll/consolidation/generateMonthlyPayroll";

export async function POST(
  req
) {

  try {

    await requireAuth();

    const body =
      await req.json();

    const result =
      await generateMonthlyPayroll({

        tenantId:
          body.tenantId,

        payrollMonth:
          body.payrollMonth,

      });

    return NextResponse.json({

      success: true,

      result,

    });

  } catch (error) {

    console.error("PAYROLL_GENERATE_ERROR");
    console.error(error);
    console.error(error?.stack);

    return NextResponse.json(
      {
        success: false,
        error: error?.message,
        stack: error?.stack,
      },
      {
        status: 500,
      }
    );

  }

}
