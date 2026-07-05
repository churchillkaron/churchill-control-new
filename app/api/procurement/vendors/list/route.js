export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const organizationId =
      searchParams.get("organizationId") ||
      searchParams.get("organization_id");

    if (!organizationId) {
      return NextResponse.json(
        {
          success: false,
          error: "organizationId required",
          vendors: [],
        },
        { status: 400 }
      );
    }

    const access =
      await requireOrganizationAccess({
        organizationId,
      });

    if (!access.success) {
      return NextResponse.json(
        {
          success: false,
          error: access.error,
          vendors: [],
        },
        { status: 403 }
      );
    }

    const { data, error } =
      await supabaseAdmin
        .from("vendors")
        .select("*")
        .eq("organization_id", organizationId)
        .order("display_name", {
          ascending: true,
        });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      vendors: data || [],
    });

  } catch (error) {

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        vendors: [],
      },
      {
        status: 500,
      }
    );

  }
}
