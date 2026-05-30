import { NextResponse }
from "next/server";

import saveOperationalSettings
from "@/lib/settings/saveOperationalSettings";

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
