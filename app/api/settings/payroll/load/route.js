import { NextResponse }
from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

export async function POST() {

  try {

    const tenantId =
      await getTenantId();

    if (!tenantId) {

      return NextResponse.json(
        {
          success: false,
          error:
            "Tenant not found",
        },
        {
          status: 401,
        }
      );

    }

    const settings =
      await loadOperationalSettings({

        tenantId,

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
