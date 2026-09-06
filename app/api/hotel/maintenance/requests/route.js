import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function fail(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const organizationId = String(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id") || "").trim();
    if (!organizationId) return fail("organizationId required");

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);

    const { data: requests, error } = await supabaseAdmin
      .from("hotel_maintenance_requests")
      .select("id,organization_id,room_id,reported_by,issue_title,issue_description,priority,status,resolved_at,created_at,updated_at")
      .eq("organization_id", access.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const roomIds = [...new Set((requests || []).map((item) => item.room_id).filter(Boolean))];
    const { data: rooms, error: roomError } = roomIds.length
      ? await supabaseAdmin
          .from("hotel_rooms")
          .select("id,property_id,room_number,room_type,status")
          .eq("organization_id", access.organizationId)
          .in("id", roomIds)
      : { data: [], error: null };
    if (roomError) throw roomError;
    const roomById = new Map((rooms || []).map((room) => [room.id, room]));

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      requests: (requests || []).map((item) => ({ ...item, hotel_rooms: item.room_id ? roomById.get(item.room_id) || null : null })),
    });
  } catch (error) {
    console.error("HOTEL_MAINTENANCE_REQUESTS_LIST_ERROR", error);
    return fail(error?.message || "Unable to load room maintenance requests", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestId = String(body.requestId || body.request_id || "").trim();
    const action = String(body.action || "").trim().toUpperCase();
    if (!requestId) return fail("requestId required");
    if (!['START', 'RESOLVE'].includes(action)) return fail("Unsupported maintenance request action");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_maintenance_requests")
      .select("id,organization_id,status")
      .eq("id", requestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return fail("Maintenance request not found", 404);

    const access = await requireOrganizationAccess({ organizationId: existing.organization_id, request });
    if (!access.success) return fail(access.error, access.status);

    const current = String(existing.status || "").toUpperCase();
    const terminal = new Set(["RESOLVED", "CLOSED", "COMPLETED", "CANCELLED"]);
    if (terminal.has(current)) return fail("Maintenance request is already closed", 409);

    const now = new Date().toISOString();
    const patch = action === "RESOLVE"
      ? { status: "RESOLVED", resolved_at: now, updated_at: now }
      : { status: "IN_PROGRESS", updated_at: now };

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("hotel_maintenance_requests")
      .update(patch)
      .eq("organization_id", access.organizationId)
      .eq("id", requestId)
      .eq("status", existing.status)
      .select("id,organization_id,room_id,issue_title,issue_description,priority,status,resolved_at,created_at,updated_at")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return fail("Maintenance request changed before this action completed", 409);

    return NextResponse.json({ success: true, organizationId: access.organizationId, request: updated });
  } catch (error) {
    console.error("HOTEL_MAINTENANCE_REQUEST_ACTION_ERROR", error);
    return fail(error?.message || "Unable to update room maintenance request", 500);
  }
}
