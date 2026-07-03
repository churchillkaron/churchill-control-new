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
          success: false,
          error: access.error,
        },
        {
          status: access.status,
        }
      );
    }

    const { data, error } =
      await supabaseAdmin
        .from("customer_payments")
        .select("*")
        .eq(
          "organization_id",
          access.organizationId
        )
        .order(
          "payment_date",
          {
            ascending: false,
          }
        );

    if (error) throw error;

    return NextResponse.json({
      success: true,
      payments: data || [],
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
