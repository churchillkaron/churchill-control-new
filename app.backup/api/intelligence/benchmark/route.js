import { NextResponse } from "next/server";

import buildCrossLocationBenchmark from "@/lib/intelligence/benchmark/buildCrossLocationBenchmark";

export async function GET() {

  try {

    const result =
      await buildCrossLocationBenchmark();

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
