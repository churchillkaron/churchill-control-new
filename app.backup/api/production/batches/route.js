import { NextResponse } from "next/server";

import createBatchProduction from "@/lib/production/batches/createBatchProduction";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await createBatchProduction(
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
