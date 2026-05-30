import { NextResponse } from "next/server";

import { registerFixedAsset } from "@/lib/finance/core/registerFixedAsset";

export async function POST(request) {
  try {
    const body =
      await request.json();

    const asset =
      await registerFixedAsset(
        body
      );

    return NextResponse.json({
      success: true,
      asset,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error.message,
      },
      {
        status: 400,
      }
    );
  }
}
