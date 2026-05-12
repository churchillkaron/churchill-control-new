import { NextResponse }
from "next/server";

import { getBusinessRecommendations }
from "@/lib/marketing/ai/recommendations/getBusinessRecommendations";

export async function POST(
  request
) {

  try {

    const body =
      await request.json();

    const {

      tenantId,

      pageId,

    } = body;

    if (
      !tenantId ||
      !pageId
    ) {

      return NextResponse.json(

        {
          success: false,
          error:
            "Missing tenantId or pageId",
        },

        {
          status: 400,
        }

      );

    }

    const result =

      await getBusinessRecommendations({

        tenantId,

        pageId,

      });

    return NextResponse.json(
      result
    );

  } catch (err) {

    console.error(
      "RECOMMENDATIONS API ERROR:",
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