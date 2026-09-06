import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLE_LEY_ORGANIZATION_ID = "9550b843-b83c-4d15-b02d-a0b5ca23346e";
const CAPABILITY_ID = "artist-agency.booking";
const RECORD_TYPE = "artist_booking";
const SOURCE_TYPE = "coleley.com";
const MAX_PER_HOUR = 6;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIGURATION_MISSING");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function text(value, max) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizedEmail(value) {
  const email = text(value, 220).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function sha(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function clientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  return forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

function parseInquiry(body = {}) {
  if (text(body.company, 1)) throw new Error("INVALID_SUBMISSION");
  const name = text(body.name, 180);
  const email = normalizedEmail(body.email);
  const phone = text(body.phone, 80);
  const location = text(body.location, 220);
  const details = text(body.details, 3000);
  const eventDateRaw = text(body.eventDate || body.event_date, 80);
  const eventDate = new Date(eventDateRaw);
  if (!name) throw new Error("NAME_REQUIRED");
  if (!email) throw new Error("VALID_EMAIL_REQUIRED");
  if (!eventDateRaw || Number.isNaN(eventDate.getTime())) throw new Error("VALID_EVENT_DATE_REQUIRED");
  return { name, email, phone, location, details, eventDate: eventDate.toISOString() };
}

export async function POST(request) {
  try {
    const raw = await request.text();
    if (!raw || raw.length > 12_000) return NextResponse.json({ error: "INVALID_REQUEST_SIZE" }, { status: 400 });

    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 }); }

    const inquiry = parseInquiry(body);
    const supabase = adminClient();
    const ipHash = sha(clientIp(request));
    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000).toISOString();

    const { data: recent, error: recentError } = await supabase
      .from("operations_records")
      .select("id,attributes,created_at")
      .eq("organization_id", COLE_LEY_ORGANIZATION_ID)
      .eq("capability_id", CAPABILITY_ID)
      .eq("record_type", RECORD_TYPE)
      .eq("source_type", SOURCE_TYPE)
      .gte("created_at", hourAgo);
    if (recentError) throw recentError;
    if ((recent || []).filter((row) => row?.attributes?.source_ip_hash === ipHash).length >= MAX_PER_HOUR) {
      return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    }

    const fingerprint = sha([inquiry.email, inquiry.eventDate.slice(0, 10), inquiry.location.toLowerCase(), inquiry.name.toLowerCase()].join("|"));
    const dayAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const { data: duplicates, error: duplicateError } = await supabase
      .from("operations_records")
      .select("id,code,status,attributes,created_at")
      .eq("organization_id", COLE_LEY_ORGANIZATION_ID)
      .eq("capability_id", CAPABILITY_ID)
      .eq("record_type", RECORD_TYPE)
      .eq("source_type", SOURCE_TYPE)
      .gte("created_at", dayAgo);
    if (duplicateError) throw duplicateError;

    const duplicate = (duplicates || []).find((row) => row?.attributes?.source_fingerprint === fingerprint);
    if (duplicate) return NextResponse.json({ success: true, inquiry_id: duplicate.id, booking_code: duplicate.code, idempotent: true });

    const code = `INQ-${Date.now().toString(36).toUpperCase()}`;
    const { data, error } = await supabase.from("operations_records").insert({
      organization_id: COLE_LEY_ORGANIZATION_ID,
      capability_id: CAPABILITY_ID,
      record_type: RECORD_TYPE,
      code,
      name: `${inquiry.name}${inquiry.location ? ` · ${inquiry.location}` : ""}`,
      description: inquiry.details || null,
      status: "draft",
      priority: "normal",
      scheduled_start: inquiry.eventDate,
      last_command: "create",
      source_domain: "website",
      source_type: SOURCE_TYPE,
      source_id: fingerprint,
      attributes: {
        _operations_lifecycle: "master",
        booking_stage: "inquiry",
        artist_name: "Cole Ley",
        buyer_name: inquiry.name,
        buyer_email: inquiry.email,
        buyer_phone: inquiry.phone || null,
        venue: inquiry.location || null,
        event_date: inquiry.eventDate,
        performance_type: null,
        hold_rank: null,
        gross_fee: 0,
        currency: "THB",
        finance_authority: "finance",
        deposit_state: "not_requested",
        rider_state: "not_started",
        advancing_state: "not_started",
        source_fingerprint: fingerprint,
        source_ip_hash: ipHash,
        source_channel: "coleley.com booking form",
      },
    }).select("id,code,status,scheduled_start,attributes,created_at").single();
    if (error) throw error;

    return NextResponse.json({ success: true, inquiry_id: data.id, booking_code: data.code }, { status: 201 });
  } catch (error) {
    const message = error?.message || "BOOKING_INQUIRY_FAILED";
    const clientErrors = new Set(["INVALID_SUBMISSION", "NAME_REQUIRED", "VALID_EMAIL_REQUIRED", "VALID_EVENT_DATE_REQUIRED"]);
    return NextResponse.json({ error: message }, { status: clientErrors.has(message) ? 400 : 500 });
  }
}
