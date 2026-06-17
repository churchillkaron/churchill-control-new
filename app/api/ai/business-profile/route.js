export const dynamic = "force-dynamic";

import { NextResponse }
from "next/server";

import { getOrCreateBusinessProfile }
from "@/lib/ai/profiles/getOrCreateBusinessProfile";

export async function GET(
  request
) {

  try {

    const { searchParams } =
      new URL(
        request.url
      );

    const tenantId =
      searchParams.get(
        "tenantId"
      );

    if (!tenantId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "tenantId required",
        },
        {
          status: 400,
        }
      );

    }

    const profile =
      await getOrCreateBusinessProfile({

        tenantId,

      });

    return NextResponse.json({

      success: true,

      profile,

    });

  } catch (err) {

    console.error(
      "BUSINESS PROFILE ERROR",
      err
    );

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );

  }

}
