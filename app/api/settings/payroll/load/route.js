import { NextResponse }
from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

export async function POST() {

  try {

    const settings =
      await loadOperationalSettings({

        tenantId:
          "76e2caa6-dd78-49e5-b0f5-1ff94185c2d4",

        domain:
          "PAYROLL",

      });

    return NextResponse.json({

      success: true,

      settings:
        settings || {},

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    });

  }

}
