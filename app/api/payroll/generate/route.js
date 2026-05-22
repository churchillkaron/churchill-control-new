import { NextResponse }
from "next/server";

import generateMonthlyPayroll
from "@/lib/payroll/consolidation/generateMonthlyPayroll";

export async function POST(
  req
) {

  try {

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
