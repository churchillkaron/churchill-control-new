export const dynamic = "force-dynamic";

import { createServerSupabase } from "@/lib/shared/supabase/server";

export async function POST(req) {
  try {
    const body = await req.json();

    const { user_id } = body;

    if (!user_id) {
      return Response.json(
        { error: "Missing user_id" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    const { data: staff, error } = await supabase
      .from("staff_accounts")
      .select(
        "id, tenant_id, role, active_organization_id, name, email"
      )
      .eq("auth_user_id", user_id)
      .maybeSingle();

    if (error) {
      return Response.json(
        { error: error.message },
        { status: 500 }
      );
    }

    if (!staff) {
      return Response.json(
        {
          success: false,
          reason: "STAFF_NOT_FOUND"
        },
        { status: 404 }
      );
    }

    const activeOrganizationId =
      staff.active_organization_id || null;

    let runtimeTenantId =
      staff.tenant_id;

    let organization = null;

    if (activeOrganizationId) {
      const {
        data: org,
        error: orgError
      } = await supabase
        .from("organizations")
        .select(
          "id,name,tenant_id"
        )
        .eq(
          "id",
          activeOrganizationId
        )
        .single();

      if (!orgError && org) {
        organization = org;

        if (org.tenant_id) {
          runtimeTenantId =
            org.tenant_id;
        }
      }
    }

    if (!runtimeTenantId) {
      return Response.json(
        {
          success: false,
          reason: "TENANT_MISSING"
        },
        { status: 409 }
      );
    }

    return Response.json({
      success: true,
      staff,
      organization,
      tenant_id: runtimeTenantId,
      role: staff.role || "staff",
      active_organization_id:
        activeOrganizationId
    });

  } catch (err) {
    return Response.json(
      {
        error:
          err.message ||
          "Server error"
      },
      {
        status: 500
      }
    );
  }
}
