import { NextResponse } from "next/server";

import createSystemOverview from "@/lib/observability/createSystemOverview";

export async function GET() {

  try {

    const result =
      await createSystemOverview();

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
