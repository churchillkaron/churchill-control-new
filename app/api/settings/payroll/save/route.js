import { NextResponse }
from "next/server";

import saveOperationalSettings
from "@/lib/settings/saveOperationalSettings";

import {
  getTenantId,
} from "@/lib/shared/tenant/getTenantId";

export async function POST(request) {

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

    const body =
      await request.json();

    await saveOperationalSettings({

      tenantId,

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
