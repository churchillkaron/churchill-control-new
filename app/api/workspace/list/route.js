export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  getErpDomains,
  getErpSolutions,
} from "@/lib/platform/registry/erpRegistry";

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function activeRecord(record = {}) {
  if (record.active === false || record.is_active === false) return false;
  const status = String(record.status || "").trim().toUpperCase();
  return !["INACTIVE", "DISABLED", "SUSPENDED", "TERMINATED", "ARCHIVED", "REVOKED"].includes(status);
}

export async function GET() {
  try {
    const user = await getServerCurrentUser();

    if (!user?.id) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,active_organization_id,active,status")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .limit(1000);

    if (staffError) throw staffError;

    const activeStaff = (staffRows || []).filter(activeRecord);
    const staffIds = activeStaff.map((row) => normalizeId(row.id)).filter(Boolean);
    const directOrganizationIds = activeStaff
      .map((row) => normalizeId(row.active_organization_id))
      .filter(Boolean);

    let membershipOrganizationIds = [];

    if (staffIds.length) {
      const { data: memberships, error: membershipError } = await supabaseAdmin
        .from("organization_users")
        .select("organization_id,status,staff_account_id")
        .in("staff_account_id", staffIds)
        .limit(1000);

      if (membershipError) throw membershipError;

      membershipOrganizationIds = (memberships || [])
        .filter(activeRecord)
        .map((row) => normalizeId(row.organization_id))
        .filter(Boolean);
    }

    const organizationIds = [
      ...new Set([...directOrganizationIds, ...membershipOrganizationIds]),
    ];

    let organizations = [];

    if (organizationIds.length) {
      const { data, error } = await supabaseAdmin
        .from("organizations")
        .select("id,name,organization_type,country,default_currency,status")
        .in("id", organizationIds)
        .order("name", { ascending: true });

      if (error) throw error;
      organizations = (data || []).filter(activeRecord);
    }

    const industries = getErpSolutions().map((solution) => ({
      industry_id: solution.id,
      name: solution.name,
      route: solution.route,
      runtime: {
        modules: [],
      },
    }));

    const modules = getErpDomains().map((domain) => ({
      id: domain.id,
      name: domain.name,
      route: domain.route || null,
      type: domain.type,
      description: domain.description,
    }));

    return NextResponse.json({
      success: true,
      organizations,
      industries,
      modules,
    });
  } catch (error) {
    console.error("WORKSPACE_LIST_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load workspace organizations",
      },
      { status: 500 }
    );
  }
}
