import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const STAFF_DIRECTORY_ROLES = new Set([
  "SUPER_ADMIN",
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "ADMIN",
  "MANAGER",
  "HR_ADMIN",
]);

function canSearchStaffDirectory(context) {
  return STAFF_DIRECTORY_ROLES.has(String(context?.role || context?.staff?.role || "").trim().toUpperCase());
}

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

    if (!canSearchStaffDirectory(context)) {
      return NextResponse.json(
        { success: false, error: "Staff directory search requires management authority", code: "STAFF_DIRECTORY_SEARCH_FORBIDDEN" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get("query") || "").trim();

    let staffQuery = supabaseAdmin
      .from("staff_accounts")
      .select("id,name,role,position,department,profile_picture,party_id")
      .eq("active_organization_id", context.organizationId)
      .eq("active", true)
      .neq("id", context.staff.id)
      .limit(20);

    if (query) {
      const safeQuery = query.replace(/[%_,()]/g, " ").trim();

      if (safeQuery) {
        staffQuery = staffQuery.ilike("name", `%${safeQuery}%`);
      }
    }

    const { data, error } = await staffQuery;

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      staff: data || [],
    });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to search staff");
  }
}
