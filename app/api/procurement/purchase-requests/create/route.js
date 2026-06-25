import { NextResponse } from "next/server";

import { createPurchaseRequest } from "@/lib/procurement/services/createPurchaseRequest";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const requestData =
      await createPurchaseRequest({
        tenantId:
          body.tenantId,
        requestedBy:
          body.requestedBy,
        department:
          body.department,
        requestTotal:
          body.requestTotal,
      });

    return NextResponse.json({
      success: true,
      requestData,
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
