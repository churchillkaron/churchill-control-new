import {
  evaluateHotelArrivalReadiness,
  firstHotelArrivalBlockerMessage,
} from "@/lib/hotel/server/getHotelArrivalReadiness";
import {
  evaluateHotelDepartureReadiness,
  firstHotelDepartureBlockerMessage,
} from "@/lib/hotel/server/getHotelDepartureReadiness";
import { getHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";

const BOOKING_TRANSITIONS = Object.freeze({
  CHECK_IN: Object.freeze({
    fromStatus: "RESERVED",
    toStatus: "CHECKED_IN",
    roomStatus: "OCCUPIED",
  }),
  CHECK_OUT: Object.freeze({
    fromStatus: "CHECKED_IN",
    toStatus: "CHECKED_OUT",
    roomStatus: "DIRTY",
  }),
});

class HotelBookingTransitionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "HotelBookingTransitionError";
    this.status = status;
  }
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new HotelBookingTransitionError(`${label} is required`, 400);
  return normalized;
}

async function getDepartureReadiness({ supabase, organizationId, booking, businessDate }) {
  const { data: folio, error: folioError } = await supabase
    .from("hotel_folios")
    .select("id,booking_id,currency_code,status,closed_at")
    .eq("organization_id", organizationId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (folioError) throw folioError;

  const [linesResult, transactionsResult] = await Promise.all([
    folio
      ? supabase
          .from("hotel_folio_lines")
          .select("folio_id,amount,tax_amount,voided_at")
          .eq("organization_id", organizationId)
          .eq("folio_id", folio.id)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("hotel_payment_transactions")
      .select("booking_id,status,transaction_type,processor_mode,finance_payment_id,amount,applied_amount,refunded_amount,currency_code")
      .eq("organization_id", organizationId)
      .eq("booking_id", booking.id),
  ]);
  if (linesResult.error) throw linesResult.error;
  if (transactionsResult.error) throw transactionsResult.error;

  return evaluateHotelDepartureReadiness({
    booking,
    folio: folio || null,
    folioLines: linesResult.data || [],
    transactions: transactionsResult.data || [],
    businessDate,
  });
}

async function getArrivalReadiness({ supabase, organizationId, booking }) {
  const [{ data: room, error: roomError }, { data: guest, error: guestError }] = await Promise.all([
    booking.room_id
      ? supabase
          .from("hotel_rooms")
          .select("id,status,property_id")
          .eq("organization_id", organizationId)
          .eq("id", booking.room_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    booking.guest_id
      ? supabase
          .from("hotel_guests")
          .select("id,identity_verified_at")
          .eq("organization_id", organizationId)
          .eq("id", booking.guest_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (roomError) throw roomError;
  if (guestError) throw guestError;

  return evaluateHotelArrivalReadiness({
    ...booking,
    hotel_rooms: room || null,
    hotel_guests: guest || null,
  });
}

async function readTransitionProjection({ supabase, organizationId, bookingId, status, label }) {
  const { data, error } = await supabase
    .from("hotel_bookings")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", bookingId)
    .eq("status", status)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HotelBookingTransitionError(`${label} committed without a readable booking projection`, 500);
  return data;
}

export async function transitionHotelBooking({ supabase, organizationId, bookingId, action }) {
  if (!supabase) throw new HotelBookingTransitionError("Server database connection is required", 500);

  const scopedOrganizationId = requireValue(organizationId, "organizationId");
  const scopedBookingId = requireValue(bookingId, "bookingId");
  const normalizedAction = requireValue(action, "action").toUpperCase();
  const transition = BOOKING_TRANSITIONS[normalizedAction];
  if (!transition) throw new HotelBookingTransitionError(`Unsupported hotel booking action: ${normalizedAction}`, 400);

  const { data: booking, error: bookingError } = await supabase
    .from("hotel_bookings")
    .select("*")
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedBookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new HotelBookingTransitionError("Hotel booking not found for this organization", 404);

  const currentStatus = String(booking.status || "").toUpperCase();
  if (currentStatus !== transition.fromStatus) {
    throw new HotelBookingTransitionError(`Booking must be ${transition.fromStatus} before ${normalizedAction}`, 409);
  }
  if (!booking.property_id) {
    throw new HotelBookingTransitionError("Booking has no governed Hotel property", 409);
  }

  const operationalDate = await getHotelOperationalDate({
    organizationId: scopedOrganizationId,
    propertyId: booking.property_id,
  });
  if (!operationalDate.configured || operationalDate.compatibilityFallback) {
    throw new HotelBookingTransitionError(`Configure the property's operational day before ${normalizedAction === "CHECK_IN" ? "checking in" : "checking out"} a guest`, 409);
  }

  if (normalizedAction === "CHECK_IN") {
    const readiness = await getArrivalReadiness({
      supabase,
      organizationId: scopedOrganizationId,
      booking,
    });
    if (!readiness.can_check_in) {
      throw new HotelBookingTransitionError(firstHotelArrivalBlockerMessage(readiness), 409);
    }

    const { error: checkInError } = await supabase.rpc("hotel_check_in_booking_guarded", {
      p_organization_id: scopedOrganizationId,
      p_booking_id: scopedBookingId,
      p_business_date: operationalDate.businessDate,
    });
    if (checkInError) {
      throw new HotelBookingTransitionError(checkInError.message || "Check-in state changed before the transition completed", 409);
    }

    return readTransitionProjection({
      supabase,
      organizationId: scopedOrganizationId,
      bookingId: scopedBookingId,
      status: "CHECKED_IN",
      label: "Check-in",
    });
  }

  const readiness = await getDepartureReadiness({
    supabase,
    organizationId: scopedOrganizationId,
    booking,
    businessDate: operationalDate.businessDate,
  });
  if (!readiness.can_check_out) {
    throw new HotelBookingTransitionError(firstHotelDepartureBlockerMessage(readiness), 409);
  }

  const { error: checkoutError } = await supabase.rpc("hotel_check_out_booking_guarded", {
    p_organization_id: scopedOrganizationId,
    p_booking_id: scopedBookingId,
    p_business_date: operationalDate.businessDate,
  });
  if (checkoutError) {
    throw new HotelBookingTransitionError(checkoutError.message || "Checkout state changed before the transition completed", 409);
  }

  return readTransitionProjection({
    supabase,
    organizationId: scopedOrganizationId,
    bookingId: scopedBookingId,
    status: "CHECKED_OUT",
    label: "Checkout",
  });
}

export { BOOKING_TRANSITIONS, HotelBookingTransitionError };
export default transitionHotelBooking;
