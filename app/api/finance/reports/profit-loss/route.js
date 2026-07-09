export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  run as ReportingApplicationService
} from "@/lib/finance/reporting/runtime/ReportingApplicationService";


async function executeReport(input = {}) {

  return await ReportingApplicationService(
    "profit_loss",
    input
  );

}


export async function GET(req) {

  try {

    const { searchParams } =
      new URL(req.url);

    const result =
      await executeReport({

        organizationId:
          searchParams.get("organizationId"),

        entityId:
          searchParams.get("entityId") ||
          searchParams.get("entity_id"),

        periodId:
          searchParams.get("periodId") ||
          searchParams.get("period_id"),

      });


    return NextResponse.json(result);


  } catch (error) {

    return NextResponse.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}


export async function POST(req) {

  try {

    const body =
      await req.json();


    const result =
      await executeReport(body);


    return NextResponse.json(result);


  } catch (error) {

    return NextResponse.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}
