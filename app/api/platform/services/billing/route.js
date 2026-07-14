import { NextResponse } from "next/server";

import {
  BillingRuntime,
} from "@/lib/platform/service-runtime/billing/runtime/BillingRuntime";

import * as BillingRepository
from "@/lib/platform/service-runtime/billing/repositories/BillingRepository";

export const dynamic = "force-dynamic";


function cleanValue(value) {

  const normalized =
    String(value ?? "").trim();


  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return null;
  }


  return normalized;

}


export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);


    const organizationId =
      cleanValue(
        searchParams.get("organization_id") ||
        searchParams.get("organizationId")
      );


    if (!organizationId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "organization_id required",
        },
        { status: 400 }
      );

    }


    const rows =
      await BillingRepository
        .listServiceUsageInvoices({
          organization_id:
            organizationId,
        });


    return NextResponse.json({
      success: true,
      rows,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );

  }

}


export async function POST(request) {

  try {

    const body =
      await request.json();


    const usageId =
      cleanValue(
        body?.usage_id ||
        body?.usageId
      );


    if (!usageId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "usage_id required",
        },
        { status: 400 }
      );

    }


    const result =
      await BillingRuntime
        .billUsage({
          usage_id:
            usageId,
        });


    return NextResponse.json({
      success: true,
      ...result,
    });

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );

  }

}
