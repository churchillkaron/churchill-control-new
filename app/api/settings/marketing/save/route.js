import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function POST(request) {
  try {
    const body = await request.json();

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId:
        body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const settings = body?.settings || {};
    const payload = {
      organization_id: context.organizationId,
      ...settings,
      updated_at: new Date().toISOString(),
    };

    delete payload.id;
    delete payload.created_at;
    delete payload.organizationId;

    const { data, error } = await supabaseAdmin
      .from("marketing_brand_profiles")
      .upsert(payload, {
        onConflict: "organization_id",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      settings: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save marketing settings",
      },
      { status: 500 }
    );
  }
}
