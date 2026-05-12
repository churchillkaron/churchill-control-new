import { NextResponse }
from "next/server";

import { getOwnerInsights }
from "@/lib/marketing/ai/insights/getOwnerInsight";

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

      await getOwnerInsights({

        tenantId,

        pageId,

      });

    return NextResponse.json(
      result
    );

  } catch (err) {

    console.error(
      "OWNER INSIGHTS API ERROR:",
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