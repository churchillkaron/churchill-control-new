export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const BUCKET = "staff-profile-pictures";

export async function GET(request, { params }) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });
    if (!context.success) {
      return NextResponse.json({ success: false, error: context.error, code: context.code }, { status: context.status || 403 });
    }

    const { staffId: rawStaffId } = await params;
    const staffId = String(rawStaffId || "").trim();
    if (!staffId) return NextResponse.json({ success: false, error: "staffId required" }, { status: 400 });

    const target = await supabaseAdmin.from("staff_accounts")
      .select("id,active_organization_id,active")
      .eq("id", staffId)
      .eq("active", true)
      .maybeSingle();
    if (target.error) throw target.error;
    if (!target.data) return NextResponse.json({ success: false, error: "Staff profile picture not found" }, { status: 404 });

    let sameOrganization = target.data.active_organization_id === context.organizationId;
    if (!sameOrganization) {
      const membership = await supabaseAdmin.from("organization_users")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("staff_account_id", staffId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (membership.error) throw membership.error;
      sameOrganization = Boolean(membership.data);
    }
    if (!sameOrganization) {
      return NextResponse.json({ success: false, error: "Profile picture access denied" }, { status: 403 });
    }

    const storagePath = `${context.organizationId}/${staffId}/profile`;
    const downloaded = await supabaseAdmin.storage.from(BUCKET).download(storagePath);
    if (downloaded.error || !downloaded.data) {
      return NextResponse.json({ success: false, error: "Profile picture not found" }, { status: 404 });
    }

    return new NextResponse(await downloaded.data.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": downloaded.data.type || "image/jpeg",
        "Cache-Control": "private, max-age=300, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return staffApiErrorResponse(error, "Unable to load profile picture");
  }
}
