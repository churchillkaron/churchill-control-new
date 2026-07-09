export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  calculateDepreciationCommand,
} from "@/lib/finance/fixed-assets/runtime/FixedAssetsApplicationService";

export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);

    const organization_id =
      searchParams.get("organization_id") ||
      searchParams.get("organizationId");

    const result =
      await calculateDepreciationCommand({
        organization_id,
      });

    return NextResponse.json(result);

  } catch (error) {

    return NextResponse.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}
