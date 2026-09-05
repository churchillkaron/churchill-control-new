import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

function clean(value) {
  return String(value ?? "").trim();
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId") || request.nextUrl.searchParams.get("organization_id"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId") || request.nextUrl.searchParams.get("property_id"));
    const from = clean(request.nextUrl.searchParams.get("from"));
    const to = clean(request.nextUrl.searchParams.get("to"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);
    if (!propertyId) return errorResponse("propertyId required", 400);

    const [{ data: plans, error: plansError }, { data: rooms, error: roomsError }] = await Promise.all([
      supabaseAdmin.from("hotel_rate_plans").select("*").eq("organization_id", access.organizationId).eq("property_id", propertyId).eq("active", true).order("name"),
      supabaseAdmin.from("hotel_rooms").select("id,room_number,room_type,status,base_rate,max_guests").eq("organization_id", access.organizationId).eq("property_id", propertyId).order("room_type").order("room_number"),
    ]);
    if (plansError) throw plansError;
    if (roomsError) throw roomsError;

    let calendarQuery = supabaseAdmin.from("hotel_rate_calendar").select("*").eq("organization_id", access.organizationId).eq("property_id", propertyId).order("stay_date", { ascending: true });
    if (from) calendarQuery = calendarQuery.gte("stay_date", from);
    if (to) calendarQuery = calendarQuery.lte("stay_date", to);
    const { data: calendar, error: calendarError } = await calendarQuery;
    if (calendarError) throw calendarError;
    return NextResponse.json({ success: true, ratePlans: plans || [], rooms: rooms || [], calendar: calendar || [] });
  } catch (error) {
    console.error("HOTEL_RATE_LIST_ERROR", error);
    return errorResponse(error?.message || "Unable to load hotel rates");
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId || body.organization_id);
    const propertyId = clean(body.propertyId || body.property_id);
    const ratePlanId = clean(body.ratePlanId || body.rate_plan_id);
    const roomType = clean(body.roomType || body.room_type);
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return errorResponse(access.error, access.status);
    if (!propertyId || !ratePlanId || !roomType) return errorResponse("propertyId, ratePlanId and roomType required", 400);
    if (!entries.length || entries.length > 370) return errorResponse("1 to 370 rate entries required", 400);

    const { data: plan, error: planError } = await supabaseAdmin.from("hotel_rate_plans").select("id").eq("organization_id", access.organizationId).eq("property_id", propertyId).eq("id", ratePlanId).eq("active", true).maybeSingle();
    if (planError) throw planError;
    if (!plan) return errorResponse("Active rate plan not found", 404);

    const rows = entries.map((entry) => {
      const stayDate = clean(entry.stayDate || entry.stay_date);
      const rateAmount = Number(entry.rateAmount ?? entry.rate_amount);
      const inventory = entry.inventory === null || entry.inventory === "" || entry.inventory === undefined ? null : Number(entry.inventory);
      const minStay = Number(entry.minStay ?? entry.min_stay ?? 1);
      const maxStayValue = entry.maxStay ?? entry.max_stay;
      const maxStay = maxStayValue === null || maxStayValue === "" || maxStayValue === undefined ? null : Number(maxStayValue);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(stayDate)) throw new Error("Every entry requires a valid stayDate");
      if (!Number.isFinite(rateAmount) || rateAmount < 0) throw new Error("rateAmount must be zero or greater");
      if (inventory !== null && (!Number.isInteger(inventory) || inventory < 0)) throw new Error("inventory must be a non-negative integer");
      if (!Number.isInteger(minStay) || minStay < 1) throw new Error("minStay must be at least 1");
      return {
        organization_id: access.organizationId,
        property_id: propertyId,
        rate_plan_id: ratePlanId,
        room_type: roomType,
        stay_date: stayDate,
        rate_amount: rateAmount,
        inventory,
        min_stay: minStay,
        max_stay: Number.isInteger(maxStay) && maxStay >= minStay ? maxStay : null,
        stop_sell: Boolean(entry.stopSell ?? entry.stop_sell),
        closed_to_arrival: Boolean(entry.closedToArrival ?? entry.closed_to_arrival),
        closed_to_departure: Boolean(entry.closedToDeparture ?? entry.closed_to_departure),
        updated_at: new Date().toISOString(),
      };
    });

    const { data, error } = await supabaseAdmin.from("hotel_rate_calendar").upsert(rows, { onConflict: "organization_id,property_id,rate_plan_id,room_type,stay_date" }).select();
    if (error) throw error;

    const { data: candidates, error: connectionsError } = await supabaseAdmin
      .from("hotel_channel_connections")
      .select("id,provider,display_name,credential_secret_ref")
      .eq("organization_id", access.organizationId)
      .eq("property_id", propertyId)
      .eq("status", "ACTIVE")
      .eq("provider_certified", true)
      .eq("enabled", true);
    if (connectionsError) throw connectionsError;

    const eligibleConnections = (candidates || []).filter((connection) => Boolean(clean(connection.credential_secret_ref)));
    const connectionIds = eligibleConnections.map((connection) => connection.id);
    let mappedConnectionIds = [];
    if (connectionIds.length) {
      const { data: mappings, error: mappingsError } = await supabaseAdmin.from("hotel_channel_mappings").select("connection_id").eq("organization_id", access.organizationId).eq("local_room_type", roomType).eq("local_rate_plan_id", ratePlanId).eq("active", true).in("connection_id", connectionIds);
      if (mappingsError) throw mappingsError;
      mappedConnectionIds = [...new Set((mappings || []).map((mapping) => mapping.connection_id))];
    }

    const dates = rows.map((row) => row.stay_date).sort();
    const commonJob = {
      organization_id: access.organizationId,
      property_id: propertyId,
      sync_type: "RATE_INVENTORY_DISTRIBUTION",
      date_from: dates[0],
      date_to: dates[dates.length - 1],
      change_summary: { rate_plan_id: ratePlanId, room_type: roomType, entries: rows.length },
    };
    const syncJobs = mappedConnectionIds.length
      ? mappedConnectionIds.map((connectionId) => ({ ...commonJob, connection_id: connectionId, status: "PENDING" }))
      : [{ ...commonJob, connection_id: null, status: "AWAITING_CONNECTIVITY" }];
    const { error: syncJobError } = await supabaseAdmin.from("hotel_channel_sync_jobs").insert(syncJobs);
    if (syncJobError) throw syncJobError;

    return NextResponse.json({
      success: true,
      entries: data || [],
      distributionQueued: mappedConnectionIds.length > 0,
      distributionState: mappedConnectionIds.length > 0 ? "INTERNAL_QUEUE_PENDING_PROVIDER_TRANSMISSION" : "AWAITING_CERTIFIED_CONNECTIVITY",
      destinationCount: mappedConnectionIds.length,
      providerTransmissionClaimed: false,
    });
  } catch (error) {
    console.error("HOTEL_RATE_SAVE_ERROR", error);
    return errorResponse(error?.message || "Unable to save hotel rates", 400);
  }
}
