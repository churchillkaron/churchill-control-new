import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({
      request,
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

    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("query") || "").trim();

    let staffQuery = supabaseAdmin
      .from("staff_accounts")
      .select("id,name,role,profile_picture,email,party_id")
      .eq("active_organization_id", context.organizationId)
      .eq("active", true)
      .neq("id", context.staff.id)
      .limit(20);

    if (query) {
      const safeQuery = query.replace(/[%_,()]/g, " ").trim();

      if (safeQuery) {
        staffQuery = staffQuery.or(
          `name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`
        );
      }
    }

    const { data, error } = await staffQuery;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      staff: data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to search staff",
      },
      { status: 500 }
    );
  }
}
