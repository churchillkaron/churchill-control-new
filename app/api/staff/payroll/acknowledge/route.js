import { NextResponse } from "next/server";

import acknowledgePayrollRecord
from "@/lib/payroll/consolidation/acknowledgePayrollRecord";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await acknowledgePayrollRecord({

        payrollRecordId:
          body.payrollRecordId,

        staffName:
          body.staffName || "STAFF",

      });

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (err) {

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );

  }

}
