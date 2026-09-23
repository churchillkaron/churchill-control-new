import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const OWNER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function ownerRole(value) {
  return OWNER_ROLES.has(String(value || "").trim().toUpperCase());
}

export async function POST(request) {
  try {
    const user = await getServerCurrentUser();
    if (!user?.id || !user?.email) {
      return NextResponse.json({ success:false, error:"Authentication required" }, { status:401 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedName = String(body?.name || user.user_metadata?.full_name || "").trim();
    const signupIntent = user.user_metadata?.avantiqo_self_signup === true;
    const supplierUpgrade = body?.source === "supplier_upgrade";
    const metadataIntent = user.user_metadata?.avantiqo_signup_intent === "accounting_firm" ? "accounting_firm" : "business";
    const requestedIntent = body?.intent === "accounting_firm" ? "accounting_firm" : "business";

    let supplierUpgradeAuthorized = false;
    if (supplierUpgrade) {
      const { data: supplierMemberships, error: supplierMembershipError } = await supabaseAdmin
        .from("supplier_portal_account_members")
        .select("id,role,status")
        .eq("auth_user_id", user.id)
        .eq("status", "ACTIVE");
      if (supplierMembershipError) throw supplierMembershipError;
      supplierUpgradeAuthorized = (supplierMemberships || []).some((membership) =>
        ["OWNER","ADMIN"].includes(String(membership.role || "").trim().toUpperCase())
      );
    }

    if (requestedIntent !== metadataIntent && !supplierUpgradeAuthorized) {
      return NextResponse.json({ success:false, error:"Signup intent does not match the authenticated account" }, { status:403 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,email,auth_user_id,active,active_organization_id,role")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .limit(2);
    if (existingError) throw existingError;

    if ((existing || []).length > 1) {
      return NextResponse.json(
        { success:false, error:"Multiple active Staff identities are linked to this authenticated account. Resolve the duplicate identity before onboarding." },
        { status:409 },
      );
    }

    if (existing?.length === 1) {
      if (!ownerRole(existing[0].role)) {
        return NextResponse.json(
          { success:false, error:"Business organization onboarding requires owner-level Staff authority." },
          { status:403 },
        );
      }
      return NextResponse.json({ success:true, created:false, staff:existing[0], intent:metadataIntent });
    }

    if (!signupIntent && !supplierUpgradeAuthorized) {
      return NextResponse.json({ success:false, error:"Self-service onboarding intent is missing" }, { status:403 });
    }

    const normalizedEmail = String(user.email).trim().toLowerCase();
    const { data, error } = await supabaseAdmin
      .from("staff_accounts")
      .insert({
        email: normalizedEmail,
        name: requestedName || normalizedEmail.split("@")[0],
        auth_user_id: user.id,
        role: "OWNER",
        position: "Owner",
        department: "Executive",
        active: true,
        active_organization_id: null,
        payroll_country: null,
        payroll_currency: null,
        salary_type: null,
        payroll_frequency: null,
      })
      .select("id,email,auth_user_id,active,active_organization_id,role")
      .single();

    if (error?.code === "23505") {
      const { data: raced, error: racedError } = await supabaseAdmin
        .from("staff_accounts")
        .select("id,email,auth_user_id,active,active_organization_id,role")
        .ilike("email", normalizedEmail)
        .eq("active", true)
        .limit(2);
      if (racedError) throw racedError;
      if ((raced || []).length !== 1 || String(raced[0].auth_user_id || "") !== String(user.id)) {
        return NextResponse.json(
          { success:false, error:"The signup email is already linked to a different or ambiguous Staff identity." },
          { status:409 },
        );
      }
      if (!ownerRole(raced[0].role)) {
        return NextResponse.json(
          { success:false, error:"Business organization onboarding requires owner-level Staff authority." },
          { status:403 },
        );
      }
      return NextResponse.json({ success:true, created:false, staff:raced[0], intent:metadataIntent });
    }
    if (error) throw error;

    return NextResponse.json({ success:true, created:true, staff:data, intent:metadataIntent });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to prepare onboarding identity" }, { status:500 });
  }
}
