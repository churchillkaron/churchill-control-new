import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const dynamic = "force-dynamic";

const EARLY_DEPARTURE_REASONS = Object.freeze([
  "GUEST_REQUEST",
  "TRAVEL_CHANGE",
  "MEDICAL_OR_EMERGENCY",
  "SERVICE_RECOVERY",
  "PROPERTY_REQUEST",
  "OTHER",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function errorResponse(error, status = 500) {
  return NextResponse.json({ success: false, error }, { status });
}

function commercialDecision() {
  return Object.freeze({
    refundCreated: false,
    cancellationFeePosted: false,
    unusedNightChargePosted: false,
    depositForfeited: false,
    folioChanged: false,
    bookingPriceChanged: false,
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const bookingId = clean(body.bookingId || body.booking_id);
    const action = clean(body.action).toUpperCase();

    if (!bookingId) return errorResponse("bookingId required", 400);
    if (!["PREPARE", "CONFIRM"].includes(action)) {
      return errorResponse("action must be PREPARE or CONFIRM", 400);
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("hotel_bookings")
      .select("id,organization_id,property_id,status,check_in_date,check_out_date,channel_connection_id,external_reservation_id,early_departure_review_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing?.organization_id) return errorResponse("Booking not found", 404);

    const access = await requireOrganizationAccess({
      organizationId: existing.organization_id,
      request,
    });
    if (!access.success) return errorResponse(access.error, access.status);

    if (clean(existing.status).toUpperCase() !== "CHECKED_IN") {
      return errorResponse("Only an in-house stay can use early departure", 409);
    }

    const businessDate = todayIso();
    const scheduledDeparture = clean(existing.check_out_date).slice(0, 10);
    if (!scheduledDeparture || scheduledDeparture <= businessDate) {
      return errorResponse("This stay is already due to depart. Use the normal departure flow.", 409);
    }

    const changedAt = new Date().toISOString();
    const channelReportingRequired = Boolean(
      existing.channel_connection_id && existing.external_reservation_id,
    );

    if (action === "PREPARE") {
      const reason = clean(body.reason).toUpperCase();
      const detail = clean(body.detail);
      if (!EARLY_DEPARTURE_REASONS.includes(reason)) {
        return errorResponse("A valid early departure reason is required", 400);
      }
      if (reason === "OTHER" && !detail) {
        return errorResponse("Explain the early departure when reason is OTHER", 400);
      }
      if (detail.length > 1000) return errorResponse("Early departure detail is too long", 400);

      const { data: booking, error: updateError } = await supabaseAdmin
        .from("hotel_bookings")
        .update({
          early_departure_requested_at: changedAt,
          early_departure_business_date: businessDate,
          early_departure_reason: detail ? `${reason}: ${detail}` : reason,
          early_departure_review_status: "REVIEW_REQUIRED",
          early_departure_reviewed_at: null,
          early_departure_review_note: null,
          updated_at: changedAt,
        })
        .eq("organization_id", access.organizationId)
        .eq("id", bookingId)
        .eq("status", "CHECKED_IN")
        .gt("check_out_date", businessDate)
        .select()
        .maybeSingle();

      if (updateError) throw updateError;
      if (!booking) return errorResponse("Stay state changed before early departure could be prepared", 409);

      return NextResponse.json({
        success: true,
        booking,
        earlyDeparture: {
          state: "REVIEW_REQUIRED",
          businessDate,
          scheduledDeparturePreserved: true,
          stayInventoryReleased: false,
          financialReviewRequired: true,
          commercialDecision: commercialDecision(),
          channelReportingRequired,
        },
      });
    }

    const reviewNote = clean(body.reviewNote || body.review_note);
    if (reviewNote.length < 8) {
      return errorResponse("Describe the reviewed unused-night, refund, fee or no-adjustment treatment", 400);
    }
    if (reviewNote.length > 1000) return errorResponse("Commercial review note is too long", 400);

    if (clean(existing.early_departure_review_status).toUpperCase() === "CONFIRMED") {
      return NextResponse.json({
        success: true,
        alreadyConfirmed: true,
        booking: existing,
        earlyDeparture: {
          state: "CONFIRMED",
          businessDate,
          scheduledDeparturePreserved: true,
          stayInventoryReleased: false,
          financialReviewRequired: false,
          commercialDecision: commercialDecision(),
          channelReportingRequired,
        },
      });
    }

    if (clean(existing.early_departure_review_status).toUpperCase() !== "REVIEW_REQUIRED") {
      return errorResponse("Prepare early departure before confirming commercial review", 409);
    }

    const { data: booking, error: updateError } = await supabaseAdmin
      .from("hotel_bookings")
      .update({
        early_departure_review_status: "CONFIRMED",
        early_departure_reviewed_at: changedAt,
        early_departure_review_note: reviewNote,
        updated_at: changedAt,
      })
      .eq("organization_id", access.organizationId)
      .eq("id", bookingId)
      .eq("status", "CHECKED_IN")
      .eq("early_departure_review_status", "REVIEW_REQUIRED")
      .gt("check_out_date", businessDate)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!booking) return errorResponse("Early departure review state changed before confirmation", 409);

    return NextResponse.json({
      success: true,
      booking,
      earlyDeparture: {
        state: "CONFIRMED",
        businessDate,
        scheduledDeparturePreserved: true,
        stayInventoryReleased: false,
        financialReviewRequired: false,
        commercialDecision: commercialDecision(),
        channelReportingRequired,
      },
    });
  } catch (error) {
    console.error("HOTEL_EARLY_DEPARTURE_ERROR", error);
    return errorResponse(error?.message || "Early departure failed", 500);
  }
}

export { EARLY_DEPARTURE_REASONS };
