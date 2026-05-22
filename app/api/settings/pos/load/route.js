import { NextResponse }
from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

export async function POST(req) {

  try {

    const {
      tenantId,
    } = await req.json();

    const settings =
      await loadOperationalSettings({

        tenantId,

        domain:
          "POS",

      });

    return NextResponse.json({

      success: true,

      settings,

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
