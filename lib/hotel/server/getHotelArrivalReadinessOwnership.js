import { getHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const ACTIVE_BOOKING = new Set(["RESERVED", "CHECKED_IN"]);
const ACTIVE_HOUSEKEEPING = new Set(["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"]);
const TERMINAL_MAINTENANCE = new Set(["RESOLVED", "CLOSED", "COMPLETED", "CANCELLED"]);

function clean(value) { return String(value ?? "").trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function dateValue(value) { return clean(value).slice(0, 10); }
function partySize(booking) { return Math.max(Number(booking?.adults || 0) + Number(booking?.children || 0), 1); }
function timestamp(value) {
  const parsed = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
function naturalRoom(left, right) {
  return clean(left).localeCompare(clean(right), undefined, { numeric: true, sensitivity: "base" });
}
function overlaps(left, right) {
  const leftIn = dateValue(left?.check_in_date);
  const leftOut = dateValue(left?.check_out_date);
  const rightIn = dateValue(right?.check_in_date);
  const rightOut = dateValue(right?.check_out_date);
  if (!leftIn || !leftOut || !rightIn || !rightOut) return true;
  return rightIn < leftOut && rightOut > leftIn;
}

function housekeepingAction(task) {
  const status = upper(task?.task_status);
  if (status === "AWAITING_INSPECTION") return { code: "INSPECT_ROOM", label: "Inspect & release room" };
  if (status === "IN_PROGRESS") return { code: "FINISH_CLEANING", label: "Finish cleaning" };
  return { code: "START_CLEANING", label: "Start cleaning" };
}

function maintenancePriority(requests) {
  const rank = { CRITICAL: 0, URGENT: 1, HIGH: 2, NORMAL: 3, LOW: 4 };
  return [...requests].sort((a, b) => (rank[upper(a.priority)] ?? 9) - (rank[upper(b.priority)] ?? 9) || (timestamp(a.created_at) ?? 0) - (timestamp(b.created_at) ?? 0))[0] || null;
}

function arrivalSort(left, right) {
  const leftEta = timestamp(left.estimated_arrival_at);
  const rightEta = timestamp(right.estimated_arrival_at);
  if (leftEta !== null || rightEta !== null) return (leftEta ?? Number.MAX_SAFE_INTEGER) - (rightEta ?? Number.MAX_SAFE_INTEGER);
  return clean(left.booking_reference).localeCompare(clean(right.booking_reference));
}

function findReadyAlternative({ booking, currentRoom, roomsByProperty, activeBookingsByProperty, housekeepingByRoom, maintenanceByRoom }) {
  const people = partySize(booking);
  const rooms = roomsByProperty.get(booking.property_id) || [];
  const activeBookings = activeBookingsByProperty.get(booking.property_id) || [];
  const preferredType = clean(currentRoom?.room_type);

  return rooms
    .filter((room) => {
      if (!room?.id || room.id === booking.room_id) return false;
      if (upper(room.status) !== "AVAILABLE") return false;
      if (Number(room.max_guests || 0) < people) return false;
      if ((housekeepingByRoom.get(room.id) || []).length) return false;
      if ((maintenanceByRoom.get(room.id) || []).length) return false;
      return !activeBookings.some((other) => other.id !== booking.id && other.room_id === room.id && overlaps(booking, other));
    })
    .map((room) => ({
      id: room.id,
      roomNumber: room.room_number,
      roomType: room.room_type,
      status: room.status,
      maxGuests: room.max_guests,
      roomTypeContinuity: Boolean(preferredType && clean(room.room_type) === preferredType),
      capacityWaste: Math.max(Number(room.max_guests || 0) - people, 0),
    }))
    .sort((left, right) => {
      if (left.roomTypeContinuity !== right.roomTypeContinuity) return left.roomTypeContinuity ? -1 : 1;
      if (left.capacityWaste !== right.capacityWaste) return left.capacityWaste - right.capacityWaste;
      return naturalRoom(left.roomNumber, right.roomNumber);
    })[0] || null;
}

export async function getHotelArrivalReadinessOwnership({ organizationId, propertyId = null, at = new Date() } = {}) {
  const organization = clean(organizationId);
  const scopedProperty = clean(propertyId);
  if (!organization) throw new Error("organizationId required for Hotel arrival readiness ownership");

  const bookingQuery = supabaseAdmin
    .from("hotel_bookings")
    .select("id,organization_id,property_id,guest_id,room_id,booking_reference,check_in_date,check_out_date,status,estimated_arrival_at,adults,children")
    .eq("organization_id", organization)
    .eq("status", "RESERVED");
  if (scopedProperty) bookingQuery.eq("property_id", scopedProperty);

  const { data: reservations, error: reservationError } = await bookingQuery.order("check_in_date", { ascending: true });
  if (reservationError) throw reservationError;

  const propertyIds = [...new Set((reservations || []).map((booking) => booking.property_id).filter(Boolean))];
  if (scopedProperty && !propertyIds.includes(scopedProperty)) propertyIds.push(scopedProperty);

  const operationalByProperty = new Map();
  const configurationBlockers = [];
  for (const id of propertyIds) {
    const operational = await getHotelOperationalDate({ organizationId: organization, propertyId: id, at });
    operationalByProperty.set(id, operational);
    if (!operational.configured) {
      configurationBlockers.push({
        propertyId: id,
        owner: "FRONT_DESK",
        code: "OPERATIONAL_DAY_REQUIRED",
        nextAction: "Configure property operational day",
        detail: "Arrival ownership will not infer a due-today queue from server or browser time.",
      });
    }
  }

  const dueReservations = (reservations || []).filter((booking) => {
    const operational = operationalByProperty.get(booking.property_id);
    return operational?.configured && clean(booking.check_in_date) <= clean(operational.businessDate);
  });
  const guestIds = [...new Set(dueReservations.map((booking) => booking.guest_id).filter(Boolean))];

  const [roomsResult, activeBookingsResult, guestsResult] = await Promise.all([
    propertyIds.length
      ? supabaseAdmin.from("hotel_rooms").select("id,property_id,room_number,room_type,floor,max_guests,status").eq("organization_id", organization).in("property_id", propertyIds)
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? supabaseAdmin.from("hotel_bookings").select("id,property_id,room_id,status,check_in_date,check_out_date").eq("organization_id", organization).in("property_id", propertyIds).in("status", [...ACTIVE_BOOKING])
      : Promise.resolve({ data: [], error: null }),
    guestIds.length
      ? supabaseAdmin.from("hotel_guests").select("id,full_name,vip_status").eq("organization_id", organization).in("id", guestIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [roomsResult, activeBookingsResult, guestsResult]) if (result.error) throw result.error;

  const rooms = roomsResult.data || [];
  const propertyRoomIds = [...new Set(rooms.map((room) => room.id).filter(Boolean))];
  const [housekeepingResult, maintenanceResult] = await Promise.all([
    propertyRoomIds.length
      ? supabaseAdmin.from("hotel_housekeeping_tasks").select("id,room_id,task_status,priority,assigned_to,task_date,updated_at").eq("organization_id", organization).in("room_id", propertyRoomIds)
      : Promise.resolve({ data: [], error: null }),
    propertyRoomIds.length
      ? supabaseAdmin.from("hotel_maintenance_requests").select("id,room_id,issue_title,issue_description,priority,status,created_at,updated_at").eq("organization_id", organization).in("room_id", propertyRoomIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of [housekeepingResult, maintenanceResult]) if (result.error) throw result.error;

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const roomsByProperty = new Map();
  for (const room of rooms) {
    if (!roomsByProperty.has(room.property_id)) roomsByProperty.set(room.property_id, []);
    roomsByProperty.get(room.property_id).push(room);
  }
  const guestById = new Map((guestsResult.data || []).map((guest) => [guest.id, guest]));
  const activeBookingsByProperty = new Map();
  for (const booking of activeBookingsResult.data || []) {
    if (!ACTIVE_BOOKING.has(upper(booking.status))) continue;
    if (!activeBookingsByProperty.has(booking.property_id)) activeBookingsByProperty.set(booking.property_id, []);
    activeBookingsByProperty.get(booking.property_id).push(booking);
  }
  const housekeepingByRoom = new Map();
  for (const task of housekeepingResult.data || []) {
    if (!ACTIVE_HOUSEKEEPING.has(upper(task.task_status))) continue;
    if (!housekeepingByRoom.has(task.room_id)) housekeepingByRoom.set(task.room_id, []);
    housekeepingByRoom.get(task.room_id).push(task);
  }
  const maintenanceByRoom = new Map();
  for (const request of maintenanceResult.data || []) {
    if (TERMINAL_MAINTENANCE.has(upper(request.status))) continue;
    if (!maintenanceByRoom.has(request.room_id)) maintenanceByRoom.set(request.room_id, []);
    maintenanceByRoom.get(request.room_id).push(request);
  }

  const items = dueReservations.sort(arrivalSort).map((booking) => {
    const operational = operationalByProperty.get(booking.property_id) || null;
    const room = booking.room_id ? roomById.get(booking.room_id) || null : null;
    const guest = booking.guest_id ? guestById.get(booking.guest_id) || null : null;
    const housekeepingTasks = booking.room_id ? housekeepingByRoom.get(booking.room_id) || [] : [];
    const activeHousekeeping = [...housekeepingTasks].sort((a, b) => {
      const rank = { AWAITING_INSPECTION: 0, IN_PROGRESS: 1, PENDING: 2 };
      return (rank[upper(a.task_status)] ?? 9) - (rank[upper(b.task_status)] ?? 9);
    })[0] || null;
    const maintenanceRequests = booking.room_id ? maintenanceByRoom.get(booking.room_id) || [] : [];
    const maintenance = maintenancePriority(maintenanceRequests);

    let owner = "FRONT_DESK";
    let state = "BLOCKED";
    let blockerCode = "ROOM_UNASSIGNED";
    let blockerDetail = "Arrival has no physical room assignment.";
    let nextAction = { code: "ASSIGN_ROOM", label: "Assign a safe room" };

    if (room) {
      if (maintenance) {
        owner = "MAINTENANCE";
        blockerCode = "MAINTENANCE";
        blockerDetail = maintenance.issue_title || "Room has unresolved maintenance.";
        nextAction = { code: "RESOLVE_MAINTENANCE", label: "Resolve room defect" };
      } else if (activeHousekeeping) {
        owner = "HOUSEKEEPING";
        blockerCode = upper(activeHousekeeping.task_status) === "AWAITING_INSPECTION" ? "INSPECTION_REQUIRED" : "HOUSEKEEPING";
        blockerDetail = upper(activeHousekeeping.task_status) === "AWAITING_INSPECTION"
          ? "Cleaning is complete but the room has not passed inspection."
          : "Room still has active Housekeeping work.";
        nextAction = housekeepingAction(activeHousekeeping);
      } else if (upper(room.status) === "AVAILABLE") {
        owner = null;
        state = "READY";
        blockerCode = null;
        blockerDetail = "Assigned room is physically available with no active Housekeeping or Maintenance blocker.";
        nextAction = { code: "CHECK_IN", label: "Continue arrival" };
      } else if (["DIRTY", "CLEANING", "CLEAN"].includes(upper(room.status))) {
        owner = "HOUSEKEEPING";
        blockerCode = "HOUSEKEEPING_TASK_MISSING";
        blockerDetail = `Room state is ${upper(room.status)}, but no active Housekeeping task owns the work.`;
        nextAction = { code: "CREATE_HOUSEKEEPING_WORK", label: "Create/restore Housekeeping work" };
      } else {
        owner = "FRONT_DESK";
        blockerCode = upper(room.status) === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : "ROOM_NOT_READY";
        blockerDetail = `Assigned room state is ${upper(room.status) || "UNKNOWN"}.`;
        nextAction = { code: "MOVE_OR_INVESTIGATE_ROOM", label: "Move guest or investigate room" };
      }
    }

    const underlyingOwner = owner;
    const underlyingBlocker = blockerCode ? { code: blockerCode, detail: blockerDetail } : null;
    const recommendedRoom = state === "BLOCKED" ? findReadyAlternative({
      booking,
      currentRoom: room,
      roomsByProperty,
      activeBookingsByProperty,
      housekeepingByRoom,
      maintenanceByRoom,
    }) : null;

    if (recommendedRoom) {
      owner = "FRONT_DESK";
      blockerCode = "READY_ALTERNATIVE_AVAILABLE";
      blockerDetail = room
        ? `Room ${recommendedRoom.roomNumber} is guest-ready now and passes current capacity, overlap, Housekeeping and Maintenance checks. Room ${room.room_number} remains blocked by ${underlyingBlocker?.code || "its current state"}.`
        : `Room ${recommendedRoom.roomNumber} is guest-ready now and passes current capacity, overlap, Housekeeping and Maintenance checks.`;
      nextAction = {
        code: room ? "REASSIGN_READY_ALTERNATIVE" : "ASSIGN_READY_ALTERNATIVE",
        label: room ? `Move to Room ${recommendedRoom.roomNumber}` : `Assign Room ${recommendedRoom.roomNumber}`,
        roomId: recommendedRoom.id,
      };
    }

    return {
      booking: {
        id: booking.id,
        reference: booking.booking_reference || null,
        checkInDate: booking.check_in_date,
        estimatedArrivalAt: booking.estimated_arrival_at || null,
      },
      operationalDay: operational ? {
        businessDate: operational.businessDate || null,
        timeZone: operational.timeZone || operational.timezone || null,
      } : null,
      guest: guest ? { id: guest.id, name: guest.full_name || null, vipStatus: guest.vip_status || null } : null,
      room: room ? { id: room.id, number: room.room_number, type: room.room_type, status: room.status } : null,
      recommendedRoom,
      state,
      owner,
      blocker: blockerCode ? { code: blockerCode, detail: blockerDetail } : null,
      underlyingOwner: recommendedRoom ? underlyingOwner : null,
      underlyingBlocker: recommendedRoom ? underlyingBlocker : null,
      nextAction,
      sourceEvidence: {
        housekeepingTaskId: activeHousekeeping?.id || null,
        maintenanceRequestId: maintenance?.id || null,
      },
    };
  }).sort((left, right) => {
    if (left.state !== right.state) return left.state === "BLOCKED" ? -1 : 1;
    if (Boolean(left.recommendedRoom) !== Boolean(right.recommendedRoom)) return left.recommendedRoom ? -1 : 1;
    const ownerRank = { FRONT_DESK: 0, MAINTENANCE: 1, HOUSEKEEPING: 2 };
    const ownerDelta = (ownerRank[left.owner] ?? 9) - (ownerRank[right.owner] ?? 9);
    if (ownerDelta) return ownerDelta;
    return naturalRoom(left.room?.number, right.room?.number);
  });

  return {
    organizationId: organization,
    propertyId: scopedProperty || null,
    configurationBlockers,
    items,
    summary: {
      dueArrivals: items.length,
      ready: items.filter((item) => item.state === "READY").length,
      blocked: items.filter((item) => item.state === "BLOCKED").length,
      fastPathReadyRooms: items.filter((item) => item.state === "BLOCKED" && item.recommendedRoom).length,
      frontDeskOwned: items.filter((item) => item.owner === "FRONT_DESK").length,
      housekeepingOwned: items.filter((item) => item.owner === "HOUSEKEEPING").length,
      maintenanceOwned: items.filter((item) => item.owner === "MAINTENANCE").length,
    },
  };
}

export default getHotelArrivalReadinessOwnership;
