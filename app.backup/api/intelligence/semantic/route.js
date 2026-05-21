import { NextResponse } from "next/server";

import buildEnterpriseSemanticFederation from "@/lib/intelligence/semantic/buildEnterpriseSemanticFederation";

export async function GET() {

  try {

    const result =
      await buildEnterpriseSemanticFederation();

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
