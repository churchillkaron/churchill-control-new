import { getHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_BOOKING_STATUSES = ["RESERVED", "CHECKED_IN"];
const ACTIVE_HOUSEKEEPING_STATUSES = ["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"];
const CLOSED_MAINTENANCE_STATUSES = new Set(["RESOLVED", "CLOSED", "COMPLETED", "CANCELLED"]);

function clean(value) { return String(value ?? "").trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function dateValue(value) { return clean(value).slice(0, 10); }
function partySize(booking) { return Math.max(Number(booking?.adults || 0) + Number(booking?.children || 0), 1); }
function overlaps(left, right) {
  const leftIn = dateValue(left?.check_in_date);
  const leftOut = dateValue(left?.check_out_date);
  const rightIn = dateValue(right?.check_in_date);
  const rightOut = dateValue(right?.check_out_date);
  if (!leftIn || !leftOut || !rightIn || !rightOut) return true;
  return rightIn < leftOut && rightOut > leftIn;
}

function blocker(code, detail) { return Object.freeze({ code, detail }); }

export async function getHotelRoomAssignmentOptions({ organizationId, bookingId }) {
  const organization = clean(organizationId);
  const bookingIdentity = clean(bookingId);
  if (!organization) throw new Error("organizationId required");
  if (!bookingIdentity) throw new Error("bookingId required");

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("hotel_bookings")
    .select("*")
    .eq("organization_id", organization)
    .eq("id", bookingIdentity)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Booking not found");
  if (!booking.property_id) throw new Error("Booking property required before room assignment");

  const operationalDate = await getHotelOperationalDate({ organizationId: organization, propertyId: booking.property_id });
  const roomResults = await Promise.all([
    supabaseAdmin.from("hotel_rooms").select("*").eq("organization_id", organization).eq("property_id", booking.property_id).order("room_number"),
    supabaseAdmin.from("hotel_bookings").select("id,room_id,status,check_in_date,check_out_date").eq("organization_id", organization).eq("property_id", booking.property_id).in("status", ACTIVE_BOOKING_STATUSES),
    supabaseAdmin.from("hotel_housekeeping_tasks").select("id,room_id,task_status,priority,task_date,updated_at").eq("organization_id", organization).in("task_status", ACTIVE_HOUSEKEEPING_STATUSES),
    supabaseAdmin.from("hotel_maintenance_requests").select("id,room_id,status,priority,title,created_at").eq("organization_id", organization).eq("property_id", booking.property_id),
  ]);
  for (const result of roomResults) if (result.error) throw result.error;

  const [rooms, activeBookings, housekeeping, maintenance] = roomResults.map((result) => result.data || []);
  const conflictsByRoom = new Map();
  for (const other of activeBookings) {
    if (!other.room_id || other.id === booking.id || !overlaps(booking, other)) continue;
    if (!conflictsByRoom.has(other.room_id)) conflictsByRoom.set(other.room_id, []);
    conflictsByRoom.get(other.room_id).push(other.id);
  }
  const housekeepingByRoom = new Map();
  for (const task of housekeeping) {
    if (!task.room_id) continue;
    if (!housekeepingByRoom.has(task.room_id)) housekeepingByRoom.set(task.room_id, []);
    housekeepingByRoom.get(task.room_id).push(task);
  }
  const maintenanceByRoom = new Map();
  for (const request of maintenance) {
    if (!request.room_id || CLOSED_MAINTENANCE_STATUSES.has(upper(request.status))) continue;
    if (!maintenanceByRoom.has(request.room_id)) maintenanceByRoom.set(request.room_id, []);
    maintenanceByRoom.get(request.room_id).push(request);
  }

  const people = partySize(booking);
  const arrivalDueNow = upper(booking.status) === "CHECKED_IN" || (
    upper(booking.status) === "RESERVED" && operationalDate.configured && dateValue(booking.check_in_date) <= operationalDate.businessDate
  );
  const currentRoom = rooms.find((room) => room.id === booking.room_id) || null;
  const preferredRoomType = clean(currentRoom?.room_type) || null;

  const options = rooms.map((room) => {
    const blockedReasons = [];
    const activeHousekeeping = housekeepingByRoom.get(room.id) || [];
    const activeMaintenance = maintenanceByRoom.get(room.id) || [];
    const conflicts = conflictsByRoom.get(room.id) || [];
    if (Number(room.max_guests || 0) < people) blockedReasons.push(blocker("CAPACITY", `Fits ${room.max_guests || 0}; this stay has ${people} guest${people === 1 ? "" : "s"}.`));
    if (upper(room.status) === "OUT_OF_SERVICE") blockedReasons.push(blocker("OUT_OF_SERVICE", "Room is out of service."));
    if (activeMaintenance.length) blockedReasons.push(blocker("MAINTENANCE", `${activeMaintenance.length} unresolved maintenance request${activeMaintenance.length === 1 ? "" : "s"}.`));
    if (conflicts.length) blockedReasons.push(blocker("OVERLAP", "Room is already committed to another overlapping stay."));

    const eligible = blockedReasons.length === 0;
    const readyNow = eligible && upper(room.status) === "AVAILABLE" && activeHousekeeping.length === 0;
    const assignableNow = eligible && (!arrivalDueNow || readyNow);
    const whyRecommended = [];
    if (readyNow) whyRecommended.push("Physically ready now");
    if (preferredRoomType && clean(room.room_type) === preferredRoomType) whyRecommended.push("Keeps the same room type");
    const spare = Number(room.max_guests || 0) - people;
    if (eligible && spare >= 0) whyRecommended.push(spare === 0 ? "Exact capacity fit" : `${spare} spare guest place${spare === 1 ? "" : "s"}`);
    if (!readyNow && eligible && !arrivalDueNow) whyRecommended.push("Safe for future allocation; physical readiness can be completed before arrival");
    if (arrivalDueNow && eligible && !readyNow) {
      if (upper(room.status) !== "AVAILABLE") blockedReasons.push(blocker("NOT_READY", `Room state is ${upper(room.status) || "UNKNOWN"}.`));
      if (activeHousekeeping.length) blockedReasons.push(blocker("HOUSEKEEPING", "Housekeeping work is still active."));
    }

    return {
      id: room.id,
      roomNumber: room.room_number,
      roomType: room.room_type,
      floor: room.floor,
      status: room.status,
      maxGuests: room.max_guests,
      currentAssignment: room.id === booking.room_id,
      eligible,
      readyNow,
      assignableNow,
      blockedReasons,
      whyRecommended,
      capacityWaste: spare >= 0 ? spare : 999,
      roomTypeContinuity: Boolean(preferredRoomType && clean(room.room_type) === preferredRoomType),
    };
  }).sort((left, right) => {
    if (left.assignableNow !== right.assignableNow) return left.assignableNow ? -1 : 1;
    if (left.readyNow !== right.readyNow) return left.readyNow ? -1 : 1;
    if (left.roomTypeContinuity !== right.roomTypeContinuity) return left.roomTypeContinuity ? -1 : 1;
    if (left.capacityWaste !== right.capacityWaste) return left.capacityWaste - right.capacityWaste;
    return String(left.roomNumber || "").localeCompare(String(right.roomNumber || ""), undefined, { numeric: true });
  });

  const recommended = options.find((room) => room.assignableNow && !room.currentAssignment) || options.find((room) => room.assignableNow) || null;
  return Object.freeze({
    booking: {
      id: booking.id,
      propertyId: booking.property_id,
      roomId: booking.room_id,
      status: booking.status,
      checkInDate: booking.check_in_date,
      checkOutDate: booking.check_out_date,
      guests: people,
    },
    operationalDay: {
      configured: operationalDate.configured,
      businessDate: operationalDate.businessDate,
      timezone: operationalDate.timezone,
      cutoffMinutes: operationalDate.cutoffMinutes,
    },
    arrivalDueNow,
    recommendedRoomId: recommended?.id || null,
    options,
    counts: {
      total: options.length,
      assignableNow: options.filter((room) => room.assignableNow).length,
      readyNow: options.filter((room) => room.readyNow).length,
      blocked: options.filter((room) => !room.assignableNow).length,
    },
  });
}

export default getHotelRoomAssignmentOptions;
