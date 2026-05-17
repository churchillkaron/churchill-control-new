import { NextResponse } from "next/server";

import buildEnterpriseFederationLayer from "@/lib/intelligence/federation/buildEnterpriseFederationLayer";

export async function GET() {

  try {

    const result =
      await buildEnterpriseFederationLayer();

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
