import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import createFixedAsset from "@/lib/finance/fixed-assets/createFixedAsset";

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json();

    const result =
      await createFixedAsset(body);

    return NextResponse.json(
      result
    );

  } catch (error) {

    console.error(error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }

}
