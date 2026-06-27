import { NextResponse }
from "next/server";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

const organizationId = null;

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

    const organizationId =
      access.organizationId;

    const {

      name,
      start_date,
      end_date,

    } = body;

    if (

      !name ||
      !start_date ||
      !end_date

    ) {

      return NextResponse.json({

        success: false,

        error:
          "Missing required fields",

      }, {

        status: 400,

      });

    }

    // -----------------------------------
    // CHECK OVERLAP
    // -----------------------------------

    const {
      data: existing,
    } = await supabaseAdmin

      .from("accounting_periods")

      .select("*")

      .eq(
        "organization_id",
        organizationId
      )

      .or(

        `and(start_date.lte.${end_date},end_date.gte.${start_date})`

      );

    if (
      existing &&
      existing.length > 0
    ) {

      return NextResponse.json({

        success: false,

        error:
          "Period overlap detected",

      }, {

        status: 400,

      });

    }

    // -----------------------------------
    // CREATE PERIOD
    // -----------------------------------

    const {
      data,
      error,
    } = await supabaseAdmin

      .from("accounting_periods")

      .insert([{

        organization_id:
          organizationId,

        name,

        start_date,

        end_date,

        status:
          "open",

        created_by:
          "system",

      }])

      .select()

      .single();

    if (error) {

      return NextResponse.json({

        success: false,

        error:
          error.message,

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

        organization_id:
          organizationId,

        action:
          "ACCOUNTING_PERIOD_CREATED",

        entity_type:
          "accounting_period",

        entity_id:
          data.id,

        metadata: {

          name,
          start_date,
          end_date,

        },

      }]);

    return NextResponse.json({

      success: true,

      period:
        data,

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
