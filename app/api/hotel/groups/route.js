import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";
const clean = (value) => String(value ?? "").trim();
const fail = (error, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function GET(request) {
  try {
    const organizationId = clean(request.nextUrl.searchParams.get("organizationId"));
    const propertyId = clean(request.nextUrl.searchParams.get("propertyId"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    let query = supabaseAdmin.from("hotel_groups").select("*").eq("organization_id", access.organizationId).order("arrival_date", { ascending: true });
    if (propertyId) query = query.eq("property_id", propertyId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true, groups: data || [] });
  } catch (error) {
    console.error("HOTEL_GROUP_LIST_ERROR", error);
    return fail(error?.message || "Unable to load groups", 500);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = clean(body.organizationId);
    const propertyId = clean(body.propertyId);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return fail(access.error, access.status);
    const name = clean(body.name);
    if (!propertyId || !name) return fail("Property and group name required");
    const roomBlock = Math.max(0, Number.parseInt(body.roomBlock || 0, 10));
    const payload = {
      organization_id: access.organizationId,
      property_id: propertyId,
      name,
      group_code: clean(body.groupCode) || null,
      contact_guest_id: clean(body.contactGuestId) || null,
      arrival_date: clean(body.arrivalDate) || null,
      departure_date: clean(body.departureDate) || null,
      status: clean(body.status || "PROSPECT").toUpperCase(),
      room_block: roomBlock,
      notes: clean(body.notes) || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from("hotel_groups").insert(payload).select().single();
    if (error) throw error;
    return NextResponse.json({ success: true, group: data });
  } catch (error) {
    console.error("HOTEL_GROUP_CREATE_ERROR", error);
    return fail(error?.message || "Unable to create group", 500);
  }
}
