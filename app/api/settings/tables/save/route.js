import { NextResponse }
from "next/server";

import saveOperationalSettings
from "@/lib/settings/saveOperationalSettings";

export async function POST(request) {

  try {

    const {
      tenantId,
      settings,
    } = await request.json();

    const result =
      await saveOperationalSettings({

        tenantId,

        domain:
          "TABLES",

        settings,

      });

    return NextResponse.json({

      success: true,

      settings:
        result,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    });

  }

}
