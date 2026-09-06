import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function fail(error, status = 400) {
  return NextResponse.json({ success: false, error }, { status });
}

function governedMessage(error) {
  const message = String(error?.message || error?.details || error?.hint || "").trim();
  const known = [
    "Unsupported maintenance request action",
    "Maintenance request not found for this organization",
    "Maintenance request must be OPEN before START",
    "Maintenance request must be IN_PROGRESS before RESOLVE",
    "Maintenance resolution outcome is required",
    "Maintenance resolution notes are required",
    "Critical or safety maintenance resolution requires evidence reference",
    "Only a RESOLVED maintenance request can be reopened",
    "Maintenance reopen reason is required",
  ];
  return known.find((entry) => message.includes(entry)) ? message : null;
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

    const requestIds = [...new Set((requests || []).map((item) => item.id).filter(Boolean))];
    const roomIds = [...new Set((requests || []).map((item) => item.room_id).filter(Boolean))];
    const [roomsResult, eventsResult] = await Promise.all([
      roomIds.length
        ? supabaseAdmin
            .from("hotel_rooms")
            .select("id,property_id,room_number,room_type,status")
            .eq("organization_id", access.organizationId)
            .in("id", roomIds)
        : Promise.resolve({ data: [], error: null }),
      requestIds.length
        ? supabaseAdmin
            .from("hotel_maintenance_resolution_events")
            .select("id,request_id,room_id,technician_staff_account_id,action,outcome_code,resolution_notes,evidence_reference,created_at")
            .eq("organization_id", access.organizationId)
            .in("request_id", requestIds)
            .order("created_at", { ascending: false })
            .limit(1000)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (roomsResult.error) throw roomsResult.error;
    if (eventsResult.error) throw eventsResult.error;

    const roomById = new Map((roomsResult.data || []).map((room) => [room.id, room]));
    const eventsByRequest = new Map();
    for (const event of eventsResult.data || []) {
      if (!eventsByRequest.has(event.request_id)) eventsByRequest.set(event.request_id, []);
      eventsByRequest.get(event.request_id).push(event);
    }

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      requests: (requests || []).map((item) => ({
        ...item,
        hotel_rooms: item.room_id ? roomById.get(item.room_id) || null : null,
        maintenance_events: eventsByRequest.get(item.id) || [],
      })),
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
    if (!["START", "RESOLVE", "REOPEN"].includes(action)) return fail("Unsupported maintenance request action");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_maintenance_requests")
      .select("id,organization_id,status")
      .eq("id", requestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return fail("Maintenance request not found", 404);

    const access = await requireOrganizationAccess({ organizationId: existing.organization_id, request });
    if (!access.success) return fail(access.error, access.status);

    const resolutionNotes = String(body.resolutionNotes || body.resolution_notes || "").trim() || null;
    const { data, error } = await supabaseAdmin.rpc("hotel_transition_maintenance_request", {
      p_organization_id: access.organizationId,
      p_request_id: requestId,
      p_action: action,
      p_outcome_code: action === "RESOLVE" ? String(body.outcomeCode || body.outcome_code || "").trim() || null : null,
      p_resolution_notes: ["RESOLVE", "REOPEN"].includes(action) ? resolutionNotes : null,
      p_evidence_reference: action === "RESOLVE" ? String(body.evidenceReference || body.evidence_reference || "").trim() || null : null,
      p_technician_staff_account_id: access.access?.staffAccountId || null,
    });
    if (error) {
      const governed = governedMessage(error);
      if (governed) return fail(governed, 409);
      throw error;
    }

    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      request: result?.request || null,
      maintenanceEventId: result?.event_id || null,
      housekeepingReinspectionRequired: Boolean(result?.housekeeping_reinspection_required),
      roomStatusUnchanged: result?.room_status_unchanged !== false,
    });
  } catch (error) {
    console.error("HOTEL_MAINTENANCE_REQUEST_ACTION_ERROR", error);
    return fail(error?.message || "Unable to update room maintenance request", 500);
  }
}
