import { NextResponse }
from "next/server";

import loadOperationalSettings
from "@/lib/settings/loadOperationalSettings";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {

  try {

    const body =
      await request.json();

    const access =
      await requireOrganizationAccess({

        organizationId:
          body.organizationId,

      });

    if (!access.success) {

      return NextResponse.json(
        {
          success: false,
          error:
            access.error,
        },
        {
          status:
            access.status,
        }
      );

    }

    const tenantId =
      access.tenantId;

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
