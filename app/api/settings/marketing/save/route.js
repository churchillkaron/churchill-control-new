import { NextResponse }
from "next/server";

import { createServerSupabase }
from "@/lib/shared/supabase/server";

export async function POST(req) {

  try {

    const {
      tenantId,
      organizationId,
      settings,
    } = await req.json();

    const supabase =
      createServerSupabase();

    const payload = {

      tenant_id:
        tenantId,

      organization_id:
        organizationId,

      ...settings,

      updated_at:
        new Date()
          .toISOString(),

    };

    const {
      data,
      error,
    } = await supabase

      .from(
        "marketing_brand_profiles"
      )

      .upsert(
        payload,
        {
          onConflict:
            "tenant_id,organization_id",
        }
      )

      .select()

      .single();

    if (error) {

      throw error;

    }

    return NextResponse.json({

      success: true,

      settings:
        data,

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
