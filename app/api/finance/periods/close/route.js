import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const tenantId = null;

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

    const periodId =
      body.periodId;

    if (!periodId) {

      return NextResponse.json({

        success: false,

        error:
          "periodId required",

      }, {

        status: 400,

      });

    }

    // -----------------------------------
    // LOAD PERIOD
    // -----------------------------------

    const {
      data: period,
      error: periodError,
    } = await supabaseAdmin

      .from("accounting_periods")

      .select("*")

      .eq(
        "id",
        periodId
      )

      .eq(
        "tenant_id",
        tenantId
      )

      .single();

    if (
      periodError ||
      !period
    ) {

      return NextResponse.json({

        success: false,

        error:
          "Accounting period not found",

      }, {

        status: 404,

      });

    }

    // -----------------------------------
    // ALREADY CLOSED
    // -----------------------------------

    if (
      period.status === "closed"
    ) {

      return NextResponse.json({

        success: false,

        error:
          "Period already closed",

      }, {

        status: 400,

      });

    }

    // -----------------------------------
    // CLOSE PERIOD
    // -----------------------------------

    const {
      data: updated,
      error: updateError,
    } = await supabaseAdmin

      .from("accounting_periods")

      .update({

        status:
          "closed",

        closed_at:
          new Date()
            .toISOString(),

        closed_by:
          "system",

      })

      .eq(
        "id",
        periodId
      )

      .select()

      .single();

    if (updateError) {

      return NextResponse.json({

        success: false,

        error:
          updateError.message,

      }, {

        status: 500,

      });

    }

    // -----------------------------------
    // AUDIT LOG
    // -----------------------------------

    await supabaseAdmin

      .from("audit_logs")

      .insert([{

        tenant_id:
          tenantId,

        action:
          "ACCOUNTING_PERIOD_CLOSED",

        entity_type:
          "accounting_period",

        entity_id:
          periodId,

        metadata: {

          period:
            period.name,

          start_date:
            period.start_date,

          end_date:
            period.end_date,

        },

      }]);

    return NextResponse.json({

      success: true,

      message:
        "Accounting period closed successfully",

      period:
        updated,

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
