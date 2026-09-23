export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  CUSTOMER_PORTAL_COOKIE,
  isCustomerPortalSameOriginRequest,
  resolveCustomerPortalSession,
} from "@/lib/customer-portal/CustomerPortalRuntime";
import { createCustomerPortalInboundMessage } from "@/lib/customer-portal/CustomerPortalCommunicationRuntime";

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

async function resolveOwnedBooking({ organizationId, partyId, bookingType, bookingId }) {
  if (bookingType === "SERVICE") {
    const occurrence = await supabaseAdmin.from("service_plan_occurrences")
      .select("id,service_plan_id,occurrence_at,status")
      .eq("organization_id", organizationId)
      .eq("id", bookingId)
      .maybeSingle();
    if (occurrence.error) throw occurrence.error;
    if (!occurrence.data) return null;
    const plan = await supabaseAdmin.from("service_plans")
      .select("id,customer_party_id,service_name,status")
      .eq("organization_id", organizationId)
      .eq("id", occurrence.data.service_plan_id)
      .eq("customer_party_id", partyId)
      .maybeSingle();
    if (plan.error) throw plan.error;
    if (!plan.data) return null;
    return {
      type: "SERVICE",
      id: occurrence.data.id,
      reference: plan.data.service_name || occurrence.data.id,
      date: occurrence.data.occurrence_at || null,
      status: occurrence.data.status || null,
      parent_id: plan.data.id,
    };
  }

  if (bookingType === "HOTEL") {
    const guests = await supabaseAdmin.from("hotel_guests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("party_id", partyId);
    if (guests.error) throw guests.error;
    const guestIds = (guests.data || []).map((row) => row.id).filter(Boolean);
    if (!guestIds.length) return null;
    const booking = await supabaseAdmin.from("hotel_bookings")
      .select("id,guest_id,booking_reference,check_in_date,check_out_date,status")
      .eq("organization_id", organizationId)
      .eq("id", bookingId)
      .in("guest_id", guestIds)
      .maybeSingle();
    if (booking.error) throw booking.error;
    if (!booking.data) return null;
    return {
      type: "HOTEL",
      id: booking.data.id,
      reference: booking.data.booking_reference || booking.data.id,
      date: booking.data.check_in_date || null,
      check_out_date: booking.data.check_out_date || null,
      status: booking.data.status || null,
      parent_id: null,
    };
  }

  return null;
}

export async function POST(request) {
  try {
    if (!isCustomerPortalSameOriginRequest(request)) {
      return NextResponse.json({ success: false, error: "Cross-origin customer portal mutation denied" }, { status: 403 });
    }
    const session = await resolveCustomerPortalSession(request.cookies.get(CUSTOMER_PORTAL_COOKIE)?.value || null);
    if (!session) return NextResponse.json({ success: false, error: "Customer portal session required" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const bookingType = text(body.bookingType || body.booking_type, 40).toUpperCase();
    const bookingId = text(body.bookingId || body.booking_id, 200);
    const action = text(body.action, 40).toUpperCase();
    const note = text(body.note, 2000);
    if (!["SERVICE", "HOTEL"].includes(bookingType)) return NextResponse.json({ success: false, error: "bookingType must be SERVICE or HOTEL" }, { status: 400 });
    if (!bookingId) return NextResponse.json({ success: false, error: "bookingId required" }, { status: 400 });
    if (!["CHANGE", "CANCEL"].includes(action)) return NextResponse.json({ success: false, error: "action must be CHANGE or CANCEL" }, { status: 400 });

    const booking = await resolveOwnedBooking({
      organizationId: session.organization_id,
      partyId: session.party_id,
      bookingType,
      bookingId,
    });
    if (!booking) return NextResponse.json({ success: false, error: "Booking not found in customer portal scope" }, { status: 404 });

    const terminal = ["CANCELLED", "CANCELED", "CHECKED_OUT", "COMPLETED", "COMPLETE"].includes(String(booking.status || "").toUpperCase());
    if (terminal) return NextResponse.json({ success: false, error: "This booking can no longer receive change requests" }, { status: 409 });

    const duplicate = await supabaseAdmin.from("communication_messages")
      .select("id,conversation_id,status,created_at,metadata")
      .eq("organization_id", session.organization_id)
      .eq("direction", "INBOUND")
      .contains("metadata", {
        source: "EXTERNAL_CUSTOMER_PORTAL",
        source_context: {
          kind: "CUSTOMER_BOOKING_REQUEST",
          requested_action: action,
          booking_type: bookingType,
          booking_id: booking.id,
          customer_party_id: session.party_id,
        },
      })
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (duplicate.error) throw duplicate.error;
    if (duplicate.data?.id) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        request: {
          action,
          booking_type: bookingType,
          booking_id: booking.id,
          status: "REQUESTED",
          message_id: duplicate.data.id,
          conversation_id: duplicate.data.conversation_id,
        },
      });
    }

    const verb = action === "CANCEL" ? "cancel" : "change";
    const message = await createCustomerPortalInboundMessage({
      organizationId: session.organization_id,
      partyId: session.party_id,
      sessionId: session.id,
      body: `Customer requested to ${verb} ${bookingType.toLowerCase()} booking ${booking.reference}${booking.date ? ` (${booking.date})` : ""}.${note ? ` Note: ${note}` : ""}`,
      sourceContext: {
        kind: "CUSTOMER_BOOKING_REQUEST",
        requested_action: action,
        booking_type: bookingType,
        booking_id: booking.id,
        parent_id: booking.parent_id,
        booking_reference: booking.reference,
        booking_date: booking.date,
        customer_party_id: session.party_id,
      },
    });

    return NextResponse.json({
      success: true,
      request: {
        action,
        booking_type: bookingType,
        booking_id: booking.id,
        status: "REQUESTED",
        message_id: message.id,
        conversation_id: message.conversation_id,
      },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to request booking change" }, { status: 500 });
  }
}
