export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {

    await requireAuth();

    const { searchParams } = new URL(req.url);

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

    const { data, error } =
      await supabaseAdmin
        .from("customer_invoices")
        .select("*")
        .eq(
          "organization_id",
          access.organizationId
        )
        .order(
          "invoice_date",
          {
            ascending:false,
          }
        )
        .order(
          "created_at",
          {
            ascending:false,
          }
        )
        .order(
          "invoice_number",
          {
            ascending:false,
          }
        );

    if (error) {

      console.log(
        "CUSTOMER INVOICE SUPABASE ERROR",
        error
      );

      throw error;
    }

    return NextResponse.json({
      success:true,
      invoices:data || [],
    });

  } catch (error) {

    if (process.env.NODE_ENV !== "production") console.log(
      "CUSTOMER INVOICE LIST ERROR",
      error
    );

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
