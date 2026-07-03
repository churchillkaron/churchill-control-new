export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(req) {
  try {

    const { searchParams } =
      new URL(req.url);

    const access =
      await requireOrganizationAccess({
        organizationId:
          searchParams.get("organizationId"),
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const organizationId =
      access.organizationId;

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("intercompany_transactions")
      .select("*")
      .eq(
        "organization_id",
        organizationId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      );

    if (error) {
      throw error;
    }

    const rows = data || [];

    return NextResponse.json({
      success: true,
      transactions: rows,
      pending:
        rows.filter(r => r.status === "PENDING").length,
      reconciled:
        rows.filter(r => r.status === "RECONCILED").length,
      settled:
        rows.filter(r => r.status === "SETTLED").length,
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );

  }
}
