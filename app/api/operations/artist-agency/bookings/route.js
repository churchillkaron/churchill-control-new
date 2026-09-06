import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/shared/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAPABILITY_ID = "artist-agency.booking";
const RECORD_TYPE = "artist_booking";
const ALLOWED_STATUSES = new Set([
  "inquiry",
  "hold",
  "offer",
  "contract",
  "confirmed",
  "settled",
  "lost",
  "cancelled",
]);

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIGURATION_MISSING");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cleanText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanDate(value) {
  const text = cleanText(value, 40);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function resolveMembership(supabase, user, organizationId) {
  const authUserId = user?.id || user?.user_id || user?.auth_user_id;
  if (!authUserId || !organizationId) return null;

  const { data: staff, error: staffError } = await supabase
    .from("staff_accounts")
    .select("id,auth_user_id,active")
    .eq("auth_user_id", authUserId)
    .eq("active", true)
    .maybeSingle();

  if (staffError || !staff?.id) return null;

  const { data: membership, error: membershipError } = await supabase
    .from("organization_users")
    .select("id,organization_id,role,status,staff_account_id")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staff.id)
    .eq("status", "active")
    .maybeSingle();

  if (membershipError || !membership) return null;
  return { staff, membership };
}

function bookingPayload(body = {}) {
  const status = cleanText(body.status, 30).toLowerCase() || "inquiry";
  if (!ALLOWED_STATUSES.has(status)) throw new Error("INVALID_BOOKING_STATUS");

  const buyerName = cleanText(body.buyer_name || body.client_name, 180);
  const venue = cleanText(body.venue || body.location, 220);
  const eventDate = cleanDate(body.event_date || body.eventDate);
  const performanceType = cleanText(body.performance_type, 80);
  const fee = Number(body.gross_fee ?? body.fee ?? 0);
  const holdRank = body.hold_rank == null ? null : Number(body.hold_rank);

  if (!buyerName) throw new Error("BUYER_NAME_REQUIRED");
  if (!eventDate) throw new Error("EVENT_DATE_REQUIRED");
  if (!Number.isFinite(fee) || fee < 0) throw new Error("INVALID_GROSS_FEE");
  if (holdRank != null && (!Number.isInteger(holdRank) || holdRank < 1 || holdRank > 99)) {
    throw new Error("INVALID_HOLD_RANK");
  }

  return {
    status,
    buyerName,
    venue,
    eventDate,
    performanceType,
    fee,
    holdRank,
    buyerEmail: cleanText(body.buyer_email || body.email, 220),
    buyerPhone: cleanText(body.buyer_phone || body.phone, 80),
    notes: cleanText(body.notes || body.details, 3000),
    currency: cleanText(body.currency || "THB", 8).toUpperCase(),
    source: cleanText(body.source || "avantiqo", 80),
    sourceId: cleanText(body.source_id, 180) || null,
  };
}

export async function GET(request) {
  try {
    const user = await requireAuth(request);
    const organizationId = cleanText(new URL(request.url).searchParams.get("organization_id"), 80);
    const supabase = adminClient();
    const authority = await resolveMembership(supabase, user, organizationId);
    if (!authority) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const { data, error } = await supabase
      .from("operations_records")
      .select("id,organization_id,entity_id,code,name,description,status,priority,scheduled_start,scheduled_end,due_at,source_domain,source_type,source_id,attributes,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("capability_id", CAPABILITY_ID)
      .eq("record_type", RECORD_TYPE)
      .order("scheduled_start", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ bookings: data || [] });
  } catch (error) {
    const message = error?.message || "BOOKINGS_READ_FAILED";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const organizationId = cleanText(body.organization_id, 80);
    const supabase = adminClient();
    const authority = await resolveMembership(supabase, user, organizationId);
    if (!authority) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

    const payload = bookingPayload(body);

    if (payload.sourceId) {
      const { data: existing, error: existingError } = await supabase
        .from("operations_records")
        .select("id,code,status,attributes,created_at")
        .eq("organization_id", organizationId)
        .eq("capability_id", CAPABILITY_ID)
        .eq("record_type", RECORD_TYPE)
        .eq("source_type", payload.source)
        .eq("source_id", payload.sourceId)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return NextResponse.json({ booking: existing, idempotent: true });
    }

    const code = `BK-${Date.now().toString(36).toUpperCase()}`;
    const record = {
      organization_id: organizationId,
      entity_id: body.entity_id || null,
      capability_id: CAPABILITY_ID,
      record_type: RECORD_TYPE,
      code,
      name: `${payload.buyerName}${payload.venue ? ` · ${payload.venue}` : ""}`,
      description: payload.notes || null,
      status: payload.status,
      priority: payload.status === "inquiry" ? "normal" : null,
      scheduled_start: payload.eventDate,
      source_domain: "operations",
      source_type: payload.source,
      source_id: payload.sourceId,
      attributes: {
        artist_name: cleanText(body.artist_name || "Cole Ley", 180),
        buyer_name: payload.buyerName,
        buyer_email: payload.buyerEmail || null,
        buyer_phone: payload.buyerPhone || null,
        venue: payload.venue || null,
        event_date: payload.eventDate,
        performance_type: payload.performanceType || null,
        hold_rank: payload.holdRank,
        gross_fee: payload.fee,
        currency: payload.currency,
        finance_authority: "finance",
        quotation_id: body.quotation_id || null,
        customer_invoice_id: body.customer_invoice_id || null,
        deposit_state: cleanText(body.deposit_state || "not_requested", 40),
        rider_state: cleanText(body.rider_state || "not_started", 40),
        advancing_state: cleanText(body.advancing_state || "not_started", 40),
        source_evidence: body.source_evidence || null,
      },
      created_by: authority.staff.id,
      updated_by: authority.staff.id,
    };

    const { data, error } = await supabase
      .from("operations_records")
      .insert(record)
      .select("id,organization_id,code,name,status,scheduled_start,source_type,source_id,attributes,created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ booking: data }, { status: 201 });
  } catch (error) {
    const message = error?.message || "BOOKING_CREATE_FAILED";
    const clientErrors = new Set([
      "INVALID_BOOKING_STATUS",
      "BUYER_NAME_REQUIRED",
      "EVENT_DATE_REQUIRED",
      "INVALID_GROSS_FEE",
      "INVALID_HOLD_RANK",
    ]);
    const status = message === "Unauthorized" ? 401 : clientErrors.has(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
