import { NextResponse }
from "next/server";

import exportPayrollPeriod
from "@/lib/payroll/export/exportPayrollPeriod";

export async function POST(
  req
) {

  try {

    const body =
      await req.json();

    const result =
      await exportPayrollPeriod({

        tenantId:
          body.tenantId,

        payrollPeriod:
          body.payrollPeriod,

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
