import { NextResponse }
from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

import defaultTableSettings
from "@/lib/settings/defaultTableSettings";

export async function POST(request) {

  try {

    const {
      tenantId,
    } = await request.json();

    const settings =
      await loadOperationalSettings({

        tenantId,

        domain:
          "TABLES",

      });

    return NextResponse.json({

      success: true,

      settings: {

        ...defaultTableSettings,

        ...(settings || {}),

      },

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    });

  }

}
