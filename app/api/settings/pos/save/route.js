import { NextResponse }
from "next/server";

import saveOperationalSettings
from "@/lib/settings/saveOperationalSettings";

export async function POST(req) {

  try {

    const {
      tenantId,
      settings,
    } = await req.json();

    const result =
      await saveOperationalSettings({

        tenantId,

        domain:
          "POS",

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

    }, {
      status: 500,
    });

  }

}
