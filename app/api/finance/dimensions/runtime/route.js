export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {

  try {

    const { searchParams } =
      new URL(request.url);

    const access =
      await requireOrganizationAccess({
        organizationId:
          searchParams.get("organizationId"),
      });

    if (!access.success) {

      return NextResponse.json(
        {
          success:false,
          error:access.error,
        },
        {
          status:access.status,
        }
      );

    }

    const organizationId =
      access.organizationId;

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("cost_centers")
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "code"
      );

    if (error) throw error;

    return NextResponse.json({

      success:true,

      dimensions:{
        costCenters:data||[],
        departments:[],
        projects:[],
        reportingDimensions:[]
      },

      totalCostCenters:
        (data||[]).length,

    });

  } catch (error) {

    return NextResponse.json(
      {
        success:false,
        error:error.message,
      },
      {
        status:500,
      }
    );

  }

}
