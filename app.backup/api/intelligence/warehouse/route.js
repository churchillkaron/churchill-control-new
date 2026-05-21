import { NextResponse } from "next/server";

import buildEnterpriseReportingWarehouse from "@/lib/intelligence/warehouse/buildEnterpriseReportingWarehouse";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildEnterpriseReportingWarehouse(
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
