import { NextResponse } from "next/server";

import detectAnomalies from "@/lib/intelligence/anomaly/detectAnomalies";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await detectAnomalies(
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
