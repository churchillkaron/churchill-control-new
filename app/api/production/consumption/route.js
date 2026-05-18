import { NextResponse } from "next/server";

import processInventoryConsumption from "@/lib/production/consumption/processInventoryConsumption";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await processInventoryConsumption(
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
