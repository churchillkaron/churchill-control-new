const READY_EPSILON = 0.005;

function clean(value) {
  return String(value ?? "").trim();
}

function normalizedStatus(value) {
  return clean(value).toUpperCase();
}

function finiteAmount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function issue(code, label, detail, blocking = true) {
  return Object.freeze({ code, label, detail, blocking });
}

export function evaluateHotelArrivalReadiness(booking) {
  const blockers = [];
  const attention = [];
  const room = booking?.hotel_rooms || booking?.room || null;
  const guest = booking?.hotel_guests || booking?.guest || null;
  const bookingStatus = normalizedStatus(booking?.status);
  const roomStatus = normalizedStatus(room?.status);
  const depositRequired = Math.max(0, finiteAmount(booking?.deposit_required));
  const paidAmount = Math.max(0, finiteAmount(booking?.paid_amount));
  const depositOutstanding = Math.max(0, depositRequired - paidAmount);

  if (bookingStatus !== "RESERVED") {
    blockers.push(issue("BOOKING_NOT_RESERVED", "Reservation state", "Only reserved stays can be checked in."));
  }

  if (!booking?.room_id) {
    blockers.push(issue("ROOM_UNASSIGNED", "Assign room", "A physical room must be assigned before check-in."));
  } else if (!room) {
    blockers.push(issue("ROOM_NOT_FOUND", "Room unavailable", "The assigned room could not be verified."));
  } else if (roomStatus !== "AVAILABLE") {
    blockers.push(issue("ROOM_NOT_AVAILABLE", "Room not ready", `Assigned room is ${roomStatus || "not ready"}; it must be AVAILABLE before check-in.`));
  }

  if (!booking?.guest_id || !guest) {
    blockers.push(issue("GUEST_PROFILE_MISSING", "Guest profile", "A governed guest profile is required before check-in."));
  }

  if (depositOutstanding > READY_EPSILON) {
    blockers.push(issue(
      "DEPOSIT_OUTSTANDING",
      "Deposit outstanding",
      `${depositOutstanding.toFixed(2)} ${clean(booking?.currency_code) || "THB"} of the required deposit is still outstanding.`,
    ));
  }

  if (guest && !guest.identity_verified_at) {
    attention.push(issue("IDENTITY_NOT_VERIFIED", "Verify guest identity", "Identity has not yet been marked verified for this guest.", false));
  }

  const registrationStatus = normalizedStatus(booking?.registration_status);
  const preArrivalStatus = normalizedStatus(booking?.pre_arrival_status);
  if (!["COMPLETED", "VERIFIED", "REGISTERED"].includes(registrationStatus) && preArrivalStatus !== "COMPLETED") {
    attention.push(issue("REGISTRATION_INCOMPLETE", "Registration review", "Digital or desk registration is not yet complete.", false));
  }

  const canCheckIn = blockers.length === 0;
  const state = !canCheckIn ? "BLOCKED" : attention.length ? "NEEDS_ACTION" : "READY";

  return Object.freeze({
    state,
    can_check_in: canCheckIn,
    blockers,
    attention,
    deposit_required: depositRequired,
    paid_amount: paidAmount,
    deposit_outstanding: depositOutstanding,
  });
}

export function firstHotelArrivalBlockerMessage(readiness) {
  return readiness?.blockers?.[0]?.detail || "Arrival is not ready for check-in";
}

export default evaluateHotelArrivalReadiness;
