export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
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

    const { data, error } = await supabaseAdmin
      .from("payment_terms")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      paymentTerms: data || [],
      rows: data || [],
    });
  } catch (error) {
    console.error("payment-terms GET", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.message ||
          "Payment terms load failed",
      },
      { status: 500 }
    );
  }
}
