import { NextResponse }
from "next/server";

import buildLiveCommandCenter
from "@/lib/intelligence/live/buildLiveCommandCenter";

import {
  loadOperationalAlerts,
} from "@/lib/alerts/loadOperationalAlerts";

import buildPayrollIntelligence
from "@/lib/intelligence/payroll/buildPayrollIntelligence";

import getManagementRuntime
from "@/lib/management/getManagementRuntime";

export async function GET(
  request
) {

  try {

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const tenantId =
      searchParams.get(
        "tenant_id"
      );

    if (!tenantId) {

      return NextResponse.json({

        success: false,

        error:
          "tenant_id required",

      });

    }

    const [
      runtime,
      commandCenter,
      alerts,
      payrollIntel,
    ] = await Promise.all([

      getManagementRuntime({

        tenantId,

      }),

      buildLiveCommandCenter({

        tenant_id:
          tenantId,

      }),

      loadOperationalAlerts(
        tenantId
      ),

      buildPayrollIntelligence({

        tenant_id:
          tenantId,

      }),

    ]);

    return NextResponse.json({

      success: true,

      runtime,

      commandCenter,

      alerts,

      payrollIntel,

    });

  } catch (error) {

    return NextResponse.json({

      success: false,

      error:
        error.message,

    });

  }

}
