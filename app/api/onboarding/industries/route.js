import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { getOnboardingIndustryOptions } from "@/lib/onboarding/getOnboardingIndustryOptions";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getServerCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ success:false, error:"Authentication required" }, { status:401 });
  }
  try {
    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,role,active")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .limit(100);
    if (staffError) throw staffError;
    const allowedRoles = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN"]);
    const authorized = (staffRows || []).some((row) => allowedRoles.has(String(row.role || "").trim().toUpperCase()));
    if (!authorized) {
      return NextResponse.json({ success:false, error:"Organization creation requires owner authority" }, { status:403 });
    }
    const options = await getOnboardingIndustryOptions();
    return NextResponse.json({ success:true, options });
  } catch (error) {
    return NextResponse.json({ success:false, error:error?.message || "Unable to load onboarding industries" }, { status:500 });
  }
}
