import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(req) {

  try {

    await requireAuth();

    const body = await req.json();

    const access =
      await requireOrganizationAccess({
        organizationId: body.organizationId,
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
        .from("customer_invoices")
        .select(`
          *,
          customer_loyalty_accounts (
            id,
            customer_name,
            customer_phone,
            customer_email
          )
        `)
        .eq(
          "organization_id",
          body.organizationId
        )
        .order(
          "invoice_date",
          {
            ascending: false,
          }
        );

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      invoices: data || [],
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
