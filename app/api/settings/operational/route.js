import { NextResponse } from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

export async function POST(req) {

  try {

    const body =
      await req.json();

    const settings =
      await loadOperationalSettings({

        tenantId:
          body.tenantId,

        domain:
          body.domain,

      });

    return NextResponse.json({

      success: true,

      settings,

    });

  } catch (error) {

    console.error(
      "LOAD SETTINGS ERROR",
      error
    );

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
