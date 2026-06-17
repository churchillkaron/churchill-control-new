import { NextResponse }
from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

export async function POST(req) {

  try {

    const {
      tenantId,
      organizationId,
    } = await req.json();

    const supabase =
      createServerSupabase();

    const {
      data,
      error,
    } = await supabase

      .from(
        "marketing_brand_profiles"
      )

      .select("*")

      .eq(
        "tenant_id",
        tenantId
      )

      .eq(
        "organization_id",
        organizationId
      )

      .single();

    if (error &&
        error.code !== "PGRST116") {

      throw error;

    }

    return NextResponse.json({

      success: true,

      settings:
        data || null,

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
