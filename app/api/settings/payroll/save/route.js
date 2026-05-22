import { NextResponse }
from "next/server";

import saveOperationalSettings
from "@/lib/settings/saveOperationalSettings";

export async function POST(request) {

  try {

    const body =
      await request.json();

    await saveOperationalSettings({

      tenantId:
        "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",

      domain:
        "PAYROLL",

      settings:
        body,

    });

    return NextResponse.json({

      success: true,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    });

  }

}
