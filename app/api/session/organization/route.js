export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_ORGANIZATION_COOKIE = "avantiqo_active_organization_id";
const LEGACY_ACTIVE_ORGANIZATION_COOKIE = "active_organization_id";

async function resolveStaffPartyForOrganization({ staff, organizationId }) {
  if (!staff?.id || !organizationId) return null;

  if (staff.party_id) {
    const current = await supabaseAdmin
      .from("parties")
      .select("id,organization_id")
      .eq("id", staff.party_id)
      .maybeSingle();
    if (current.error) throw current.error;
    if (String(current.data?.organization_id || "") === String(organizationId)) {
      return current.data.id;
    }
  }

  const assignments = await supabaseAdmin
    .from("employee_employment_assignments")
    .select("party_id,effective_from,effective_to,status")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staff.id)
    .neq("status", "CANCELLED")
    .order("effective_from", { ascending: false })
    .limit(2);
  if (assignments.error) throw assignments.error;

  const assignmentPartyIds = [...new Set(
    (assignments.data || []).map((row) => String(row.party_id || "").trim()).filter(Boolean)
  )];
  if (assignmentPartyIds.length > 1) {
    throw new Error("Multiple employment Party identities exist for this Staff account");
  }
  if (assignmentPartyIds.length === 1) return assignmentPartyIds[0];

  const email = String(staff.email || "").trim();
  if (!email) return null;
  const parties = await supabaseAdmin
    .from("parties")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("email", email)
    .limit(2);
  if (parties.error) throw parties.error;
  if ((parties.data || []).length > 1) {
    throw new Error("Multiple Party identities match this Staff email in the selected organization");
  }
  return parties.data?.[0]?.id || null;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = String(
      body?.organizationId || body?.organization_id || ""
    ).trim();

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId required" },
        { status: 400 }
      );
    }

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
        },
        { status: context.status || 403 }
      );
    }

    const staffId = context.staff?.id || null;
    const authUserId = context.user?.id || null;

    if (!staffId || !authUserId) {
      return NextResponse.json(
        { success: false, error: "Staff identity could not be resolved" },
        { status: 409 }
      );
    }

    const selectedPartyId = await resolveStaffPartyForOrganization({
      staff: context.staff,
      organizationId: context.organizationId,
    });

    const { error: updateError } = await supabaseAdmin
      .from("staff_accounts")
      .update({
        active_organization_id: context.organizationId,
        party_id: selectedPartyId,
        role: context.role || null,
      })
      .eq("id", staffId)
      .eq("auth_user_id", authUserId);

    if (updateError) throw updateError;

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .eq("id", context.organizationId)
      .maybeSingle();

    if (organizationError) throw organizationError;

    const response = NextResponse.json({
      success: true,
      organization: organization || null,
      organizationId: context.organizationId,
      organization_id: context.organizationId,
      active_organization_id: context.organizationId,
      staffId,
      role: context.role || null,
    });

    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    };

    response.cookies.set(
      ACTIVE_ORGANIZATION_COOKIE,
      context.organizationId,
      cookieOptions
    );
    response.cookies.set(
      LEGACY_ACTIVE_ORGANIZATION_COOKIE,
      context.organizationId,
      cookieOptions
    );

    return response;
  } catch (error) {
    console.error("SESSION_ORGANIZATION_SELECTION_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to select organization",
      },
      { status: 500 }
    );
  }
}
