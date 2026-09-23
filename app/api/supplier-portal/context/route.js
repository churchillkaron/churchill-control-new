import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function mapById(rows = []) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

export async function GET() {
  try {
    const user = await getServerCurrentUser();
    if (!user?.id) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { data: accessRows, error: accessError } = await supabaseAdmin
      .from("supplier_portal_access")
      .select("id,organization_id,supplier_profile_id,supplier_party_id,email,status,created_at,updated_at")
      .eq("auth_user_id", user.id)
      .eq("status", "ACTIVE");
    if (accessError) throw accessError;

    const rows = accessRows || [];
    const organizationIds = [...new Set(rows.map((row) => row.organization_id).filter(Boolean))];
    const profileIds = [...new Set(rows.map((row) => row.supplier_profile_id).filter(Boolean))];
    const partyIds = [...new Set(rows.map((row) => row.supplier_party_id).filter(Boolean))];

    const [organizationsResult, profilesResult, partiesResult] = await Promise.all([
      organizationIds.length
        ? supabaseAdmin.from("organizations").select("id,name,legal_name,status,organization_status").in("id", organizationIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? supabaseAdmin.from("supplier_profiles").select("id,organization_id,party_id,vendor_code,payment_terms,risk_level,is_active,is_blocked").in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      partyIds.length
        ? supabaseAdmin.from("parties").select("id,organization_id,display_name,legal_name,email,phone,address,status").in("id", partyIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (organizationsResult.error) throw organizationsResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (partiesResult.error) throw partiesResult.error;

    const organizations = mapById(organizationsResult.data || []);
    const profiles = mapById(profilesResult.data || []);
    const parties = mapById(partiesResult.data || []);

    const access = rows
      .map((row) => ({
        ...row,
        organizations: organizations.get(String(row.organization_id)) || null,
        supplier_profiles: profiles.get(String(row.supplier_profile_id)) || null,
        parties: parties.get(String(row.supplier_party_id)) || null,
      }))
      .filter((row) => row.supplier_profiles?.is_active !== false && row.supplier_profiles?.is_blocked !== true);

    return NextResponse.json({ success: true, access });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to load supplier portal" }, { status: 500 });
  }
}
