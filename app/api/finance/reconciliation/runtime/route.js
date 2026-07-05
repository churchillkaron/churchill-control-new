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
      .from("bank_reconciliation")
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

      transactions:rows,

      pending:
        rows.filter(
          r => r.status === "PENDING"
        ).length,

      matched:
        rows.filter(
          r => r.status === "MATCHED"
        ).length,

      exceptions:
        rows.filter(
          r => r.status === "EXCEPTION"
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
