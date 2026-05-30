import { NextResponse } from "next/server";

import { checkInStaff } from "@/lib/payroll/core/checkInStaff";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const attendance =
      await checkInStaff({
        tenantId:
          body.tenantId,
        staffId:
          body.staffId,
        shiftName:
          body.shiftName,
        scheduledTime:
          body.scheduledTime,
      });

    return NextResponse.json({
      success: true,
      attendance,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
