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
      .from("finance_budgets")
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending:false,
        }
      );

    if (error) throw error;

    const rows =
      data || [];

    return NextResponse.json({

      success:true,

      budgets:rows,

      active:
        rows.filter(
          r => r.status === "ACTIVE"
        ).length,

      draft:
        rows.filter(
          r => r.status === "DRAFT"
        ).length,

      approved:
        rows.filter(
          r => r.status === "APPROVED"
        ).length,

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
