import { NextResponse } from "next/server";

import processYieldCalculation from "@/lib/inventory/production/yield/processYieldCalculation";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await processYieldCalculation(
        {
          ...body,
          organization_id:
            body.organization_id ||
            body.organizationId,
          entity_id:
            body.entity_id ||
            body.entityId ||
            null,
        }
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
