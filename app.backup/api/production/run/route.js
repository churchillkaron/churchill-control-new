import { NextResponse } from "next/server";

import createAlert from "@/lib/alerts/createAlert";

export async function POST() {

  try {

    await createAlert({

      tenant_id:
        "demo",

      message:
        "Production run completed.",

      severity:
        "success",
    });

    return NextResponse.json({

      success: true,
    });

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
