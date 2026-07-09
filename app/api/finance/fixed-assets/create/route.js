export const dynamic = "force-dynamic";
import {
  NextResponse,
} from "next/server";

import {
  requireAuth,
} from "@/lib/shared/auth";

import {
  createFixedAssetCommand,
} from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";

export async function POST(req) {

  try {

    await requireAuth();

    const body =
      await req.json();

    const result =
      await createFixedAssetCommand(body);

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
