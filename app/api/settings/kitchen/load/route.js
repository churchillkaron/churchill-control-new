import { NextResponse }
from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

import defaultKitchenSettings
from "@/lib/settings/defaultKitchenSettings";

export async function POST(request) {

  try {

    const {
      tenantId,
    } = await request.json();

    const settings =
      await loadOperationalSettings({

        tenantId,

        domain:
          "FULFILLMENT",

      });

    return NextResponse.json({

      success: true,

      settings: {

        ...defaultKitchenSettings,

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
