import { NextResponse } from "next/server";

import buildOperationalHealth from "@/lib/intelligence/operations/buildOperationalHealth";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const result =
      await buildOperationalHealth(
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
