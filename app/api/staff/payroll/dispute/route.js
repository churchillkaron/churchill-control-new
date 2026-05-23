import { NextResponse } from "next/server";

import disputePayrollRecord
from "@/lib/payroll/consolidation/disputePayrollRecord";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await disputePayrollRecord({

        payrollRecordId:
          body.payrollRecordId,

        staffName:
          body.staffName || "STAFF",

        disputeReason:
          body.disputeReason,

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
