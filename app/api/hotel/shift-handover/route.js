import { NextResponse } from "next/server";

import { broadcastHotelReadinessChanged } from "@/lib/hotel/server/broadcastHotelReadinessChanged";
import { getHotelShiftHandover } from "@/lib/hotel/server/getHotelShiftHandover";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

async function activeOrganizationStaff(organizationId) {
  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("staff_account_id,status")
    .eq("organization_id", organizationId);
  if (membershipError) throw membershipError;
  const staffIds = (memberships || [])
    .filter((membership) => !["INACTIVE", "DISABLED", "SUSPENDED", "TERMINATED", "ARCHIVED", "REVOKED"].includes(clean(membership.status).toUpperCase()))
    .map((membership) => membership.staff_account_id)
    .filter(Boolean);
  if (!staffIds.length) return [];
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,active")
    .in("id", staffIds)
    .order("name", { ascending: true });
  if (staffError) throw staffError;
  return (staff || []).filter((person) => person.active !== false);
}

async function currentHandover(organizationId, propertyId) {
  return getHotelShiftHandover({
    supabase: supabaseAdmin,
    organizationId,
    propertyId,
  });
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");

    const [handover, staff] = await Promise.all([
      currentHandover(access.organizationId, propertyId),
      activeOrganizationStaff(access.organizationId),
    ]);

    return NextResponse.json({
      success: true,
      propertyId,
      handover,
      staff,
      currentStaffAccountId: access.access?.staffAccountId || null,
    });
  } catch (error) {
    console.error("HOTEL_SHIFT_HANDOVER_GET_ERROR", error);
    return fail(error?.message || "Unable to build Hotel shift handover", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId);
    const propertyId = clean(body.propertyId);
    const sourceKey = clean(body.sourceKey);
    const action = clean(body.action).toUpperCase();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    if (!propertyId) return fail("propertyId required");
    if (!sourceKey) return fail("sourceKey required");
    if (!["ACKNOWLEDGE", "ASSIGN", "NOTE", "CLEAR_ACKNOWLEDGEMENT"].includes(action)) return fail("Unsupported handover action");

    const handover = await currentHandover(access.organizationId, propertyId);
    const liveException = handover.exceptions.find((item) => item.sourceKey === sourceKey);
    if (!liveException) {
      return fail("This Hotel exception is no longer live. Refresh handover instead of writing stale context.", 409);
    }

    const now = new Date().toISOString();
    const currentStaffId = access.access?.staffAccountId || null;
    const patch = {
      organization_id: access.organizationId,
      property_id: propertyId,
      source_key: sourceKey,
      source_type: liveException.sourceType,
      source_id: liveException.sourceId || null,
      updated_by_staff_account_id: currentStaffId,
      updated_at: now,
    };

    if (action === "ACKNOWLEDGE") {
      if (!currentStaffId) return fail("Authenticated staff identity is required", 409);
      patch.acknowledged_at = now;
      patch.acknowledged_by_staff_account_id = currentStaffId;
    }

    if (action === "CLEAR_ACKNOWLEDGEMENT") {
      patch.acknowledged_at = null;
      patch.acknowledged_by_staff_account_id = null;
    }

    if (action === "NOTE") {
      const note = clean(body.note);
      if (note.length > 2000) return fail("Handover note must be 2000 characters or less");
      patch.note = note || null;
    }

    if (action === "ASSIGN") {
      const assignedStaffAccountId = clean(body.assignedStaffAccountId);
      if (assignedStaffAccountId) {
        const staff = await activeOrganizationStaff(access.organizationId);
        if (!staff.some((person) => person.id === assignedStaffAccountId)) {
          return fail("Assigned staff member must be active in this organization", 409);
        }
      }
      patch.assigned_staff_account_id = assignedStaffAccountId || null;
    }

    const { data, error } = await supabaseAdmin
      .from("hotel_shift_handover_context")
      .upsert(patch, { onConflict: "organization_id,property_id,source_key" })
      .select()
      .single();
    if (error) throw error;

    await broadcastHotelReadinessChanged({
      organizationId: access.organizationId,
      source: "shift-handover-context",
      action,
    });

    const refreshed = await currentHandover(access.organizationId, propertyId);
    return NextResponse.json({ success: true, context: data, handover: refreshed });
  } catch (error) {
    console.error("HOTEL_SHIFT_HANDOVER_POST_ERROR", error);
    return fail(error?.message || "Unable to update Hotel shift handover", 500);
  }
}
