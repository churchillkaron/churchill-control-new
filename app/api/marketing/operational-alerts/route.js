import { NextResponse }
from "next/server";

import { getOperationalAlerts }
from "@/lib/marketing/ai/insights/getOperationalAlerts";

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

      await getOperationalAlerts({

        tenantId,

        pageId,

      });

    return NextResponse.json(
      result
    );

  } catch (err) {

    console.error(
      "OPERATIONAL ALERTS API ERROR:",
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