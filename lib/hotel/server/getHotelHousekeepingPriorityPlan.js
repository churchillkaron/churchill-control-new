import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";

const ACTIVE_TASK_STATUSES = new Set(["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"]);
const TERMINAL_MAINTENANCE = new Set(["RESOLVED", "CLOSED", "COMPLETED", "CANCELLED"]);
const VIP_VALUES = new Set(["VIP", "VVIP", "VIP1", "VIP2", "VIP3", "VIP4", "VIP5"]);

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function timestamp(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumber(left, right) {
  const a = Number.isFinite(left) ? left : Number.MAX_SAFE_INTEGER;
  const b = Number.isFinite(right) ? right : Number.MAX_SAFE_INTEGER;
  return a - b;
}

function taskStageRank(status) {
  if (status === "AWAITING_INSPECTION") return 0;
  if (status === "IN_PROGRESS") return 1;
  if (status === "PENDING") return 2;
  return 9;
}

function maintenanceSeverity(requests) {
  if (!requests.length) return null;
  const rank = { CRITICAL: 0, URGENT: 1, HIGH: 2, NORMAL: 3, LOW: 4 };
  return [...requests].sort((a, b) => (rank[upper(a.priority)] ?? 9) - (rank[upper(b.priority)] ?? 9))[0];
}

function arrivalUrgency({ booking, operationalDay, nowMs }) {
  if (!booking || !operationalDay?.configured) {
    return { due: false, etaMs: null, etaKnown: false, minutesUntilEta: null };
  }

  const due = clean(booking.check_in_date) <= clean(operationalDay.businessDate);
  const etaMs = timestamp(booking.estimated_arrival_at);
  const minutesUntilEta = etaMs === null ? null : Math.floor((etaMs - nowMs) / 60000);
  return { due, etaMs, etaKnown: etaMs !== null, minutesUntilEta };
}

function urgencyBand({ arrival, vip, taskStatus }) {
  if (!arrival?.due) return "ROUTINE";
  if (arrival.minutesUntilEta !== null && arrival.minutesUntilEta <= 0) return "GUEST_DUE_NOW";
  if (arrival.minutesUntilEta !== null && arrival.minutesUntilEta <= 60) return "ARRIVAL_WITHIN_60_MIN";
  if (vip && taskStatus === "AWAITING_INSPECTION") return "VIP_QC_REQUIRED";
  if (vip) return "VIP_ARRIVAL_TODAY";
  if (taskStatus === "AWAITING_INSPECTION") return "QC_BLOCKING_ARRIVAL";
  return "ARRIVAL_TODAY";
}

function explainPriority({ taskStatus, arrival, vip, maintenance, roomStatus, operationalDay }) {
  const reasons = [];
  if (!operationalDay?.configured) {
    reasons.push("Property operational day is not configured/applied, so Avantiqo will not infer arrival urgency from server time.");
  }
  if (arrival?.due) {
    if (arrival.minutesUntilEta !== null && arrival.minutesUntilEta <= 0) {
      reasons.push("Assigned guest is already at or past the recorded arrival ETA.");
    } else if (arrival.minutesUntilEta !== null && arrival.minutesUntilEta <= 60) {
      reasons.push(`Assigned guest is due in ${Math.max(0, arrival.minutesUntilEta)} minute(s).`);
    } else if (arrival.etaKnown) {
      reasons.push("Assigned guest is due on the property business day and has a recorded arrival ETA.");
    } else {
      reasons.push("Assigned guest is due on the property business day; no arrival ETA is recorded.");
    }
  }
  if (vip) reasons.push("The assigned arrival has governed VIP status.");
  if (taskStatus === "AWAITING_INSPECTION") reasons.push("Cleaning is complete; inspection is the shortest safe path to guest-ready inventory.");
  else if (taskStatus === "IN_PROGRESS") reasons.push("Cleaning is already underway; finishing it protects current work-in-progress.");
  else reasons.push("Room turnover has not started.");
  if (maintenance) reasons.push(`Unresolved maintenance (${upper(maintenance.priority) || "UNKNOWN"}) can still block release even after Housekeeping finishes.`);
  if (upper(roomStatus) === "OUT_OF_SERVICE") reasons.push("Room is out of service and cannot be released to Front Desk.");
  return reasons;
}

function nextAction(taskStatus, maintenance) {
  if (maintenance) return "RESOLVE_MAINTENANCE";
  if (taskStatus === "AWAITING_INSPECTION") return "INSPECT";
  if (taskStatus === "IN_PROGRESS") return "COMPLETE";
  return "START";
}

export async function getHotelHousekeepingPriorityPlan({ organizationId, propertyId = null, at = new Date() } = {}) {
  const scopedOrganizationId = clean(organizationId);
  if (!scopedOrganizationId) throw new Error("organizationId required for Hotel Housekeeping priority plan");

  const { data: activeTasks, error: taskError } = await supabaseAdmin
    .from("hotel_housekeeping_tasks")
    .select("id,organization_id,room_id,assigned_to,task_status,priority,task_date,notes,completed_at,created_at,updated_at")
    .eq("organization_id", scopedOrganizationId)
    .in("task_status", [...ACTIVE_TASK_STATUSES]);
  if (taskError) throw taskError;

  const roomIds = [...new Set((activeTasks || []).map((task) => task.room_id).filter(Boolean))];
  if (!roomIds.length) {
    return { organizationId: scopedOrganizationId, propertyId: clean(propertyId) || null, operationalDay: null, items: [], summary: { active: 0, arrivalCritical: 0, maintenanceBlocked: 0, inspectionReady: 0 } };
  }

  const { data: rooms, error: roomError } = await supabaseAdmin
    .from("hotel_rooms")
    .select("id,property_id,room_number,room_type,status,max_guests")
    .eq("organization_id", scopedOrganizationId)
    .in("id", roomIds);
  if (roomError) throw roomError;

  const scopedPropertyId = clean(propertyId);
  const propertyIds = [...new Set((rooms || []).map((room) => room.property_id).filter(Boolean))];
  const targetPropertyIds = scopedPropertyId ? propertyIds.filter((id) => id === scopedPropertyId) : propertyIds;
  const allowedRoomIds = new Set((rooms || []).filter((room) => targetPropertyIds.includes(room.property_id)).map((room) => room.id));
  const relevantTasks = (activeTasks || []).filter((task) => task.room_id && allowedRoomIds.has(task.room_id));
  const relevantRoomIds = [...new Set(relevantTasks.map((task) => task.room_id))];

  const [bookingResult, maintenanceResult] = await Promise.all([
    relevantRoomIds.length
      ? supabaseAdmin
          .from("hotel_bookings")
          .select("id,property_id,guest_id,room_id,booking_reference,check_in_date,check_out_date,status,estimated_arrival_at")
          .eq("organization_id", scopedOrganizationId)
          .eq("status", "RESERVED")
          .in("room_id", relevantRoomIds)
          .order("check_in_date", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    relevantRoomIds.length
      ? supabaseAdmin
          .from("hotel_maintenance_requests")
          .select("id,property_id,room_id,priority,status,issue_title,created_at")
          .eq("organization_id", scopedOrganizationId)
          .in("room_id", relevantRoomIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bookingResult.error) throw bookingResult.error;
  if (maintenanceResult.error) throw maintenanceResult.error;

  const guestIds = [...new Set((bookingResult.data || []).map((booking) => booking.guest_id).filter(Boolean))];
  const { data: guests, error: guestError } = guestIds.length
    ? await supabaseAdmin.from("hotel_guests").select("id,full_name,vip_status").eq("organization_id", scopedOrganizationId).in("id", guestIds)
    : { data: [], error: null };
  if (guestError) throw guestError;

  const roomById = new Map((rooms || []).map((room) => [room.id, room]));
  const guestById = new Map((guests || []).map((guest) => [guest.id, guest]));
  const bookingsByRoom = new Map();
  for (const booking of bookingResult.data || []) {
    if (!bookingsByRoom.has(booking.room_id)) bookingsByRoom.set(booking.room_id, []);
    bookingsByRoom.get(booking.room_id).push(booking);
  }
  const maintenanceByRoom = new Map();
  for (const request of maintenanceResult.data || []) {
    if (TERMINAL_MAINTENANCE.has(upper(request.status))) continue;
    if (!maintenanceByRoom.has(request.room_id)) maintenanceByRoom.set(request.room_id, []);
    maintenanceByRoom.get(request.room_id).push(request);
  }

  const operationalByProperty = new Map();
  for (const id of targetPropertyIds) {
    operationalByProperty.set(id, await getHotelOperationalDate({ organizationId: scopedOrganizationId, propertyId: id, at }));
  }

  const nowMs = at.getTime();
  const items = relevantTasks.map((task) => {
    const taskStatus = upper(task.task_status) || "PENDING";
    const room = roomById.get(task.room_id) || null;
    const operationalDay = room?.property_id ? operationalByProperty.get(room.property_id) || null : null;
    const dueBookings = (bookingsByRoom.get(task.room_id) || []).filter((booking) => operationalDay?.configured && clean(booking.check_in_date) <= clean(operationalDay.businessDate));
    const booking = dueBookings.sort((a, b) => {
      const etaCompare = compareNullableNumber(timestamp(a.estimated_arrival_at), timestamp(b.estimated_arrival_at));
      return etaCompare || clean(a.check_in_date).localeCompare(clean(b.check_in_date));
    })[0] || null;
    const guest = booking?.guest_id ? guestById.get(booking.guest_id) || null : null;
    const vip = VIP_VALUES.has(upper(guest?.vip_status));
    const arrival = arrivalUrgency({ booking, operationalDay, nowMs });
    const maintenance = maintenanceSeverity(maintenanceByRoom.get(task.room_id) || []);
    const band = urgencyBand({ arrival, vip, taskStatus });
    const bandRank = { GUEST_DUE_NOW: 0, ARRIVAL_WITHIN_60_MIN: 1, VIP_QC_REQUIRED: 2, QC_BLOCKING_ARRIVAL: 3, VIP_ARRIVAL_TODAY: 4, ARRIVAL_TODAY: 5, ROUTINE: 9 }[band] ?? 9;

    return {
      task,
      room,
      operationalDay: operationalDay ? {
        businessDate: operationalDay.businessDate,
        timezone: operationalDay.timezone,
        cutoffMinutes: operationalDay.cutoffMinutes,
        configured: operationalDay.configured,
      } : null,
      arrival: booking ? {
        bookingId: booking.id,
        bookingReference: booking.booking_reference || null,
        checkInDate: booking.check_in_date,
        estimatedArrivalAt: booking.estimated_arrival_at || null,
        minutesUntilEta: arrival.minutesUntilEta,
        due: arrival.due,
        guestName: guest?.full_name || null,
        vipStatus: guest?.vip_status || null,
      } : null,
      maintenance: maintenance ? {
        id: maintenance.id,
        priority: maintenance.priority || null,
        status: maintenance.status || null,
        title: maintenance.issue_title || null,
      } : null,
      urgencyBand: band,
      nextAction: nextAction(taskStatus, maintenance),
      releaseBlocked: Boolean(maintenance) || upper(room?.status) === "OUT_OF_SERVICE",
      why: explainPriority({ taskStatus, arrival, vip, maintenance, roomStatus: room?.status, operationalDay }),
      _sort: [bandRank, taskStageRank(taskStatus), arrival.etaMs, timestamp(task.updated_at), clean(room?.room_number)],
    };
  }).sort((a, b) => {
    for (let i = 0; i < 4; i += 1) {
      const delta = compareNullableNumber(a._sort[i], b._sort[i]);
      if (delta) return delta;
    }
    return clean(a._sort[4]).localeCompare(clean(b._sort[4]), undefined, { numeric: true, sensitivity: "base" });
  }).map(({ _sort, ...item }, index) => ({ ...item, rank: index + 1 }));

  return {
    organizationId: scopedOrganizationId,
    propertyId: scopedPropertyId || null,
    operationalDay: targetPropertyIds.length === 1 ? items[0]?.operationalDay || operationalByProperty.get(targetPropertyIds[0]) || null : null,
    items,
    summary: {
      active: items.length,
      arrivalCritical: items.filter((item) => item.urgencyBand !== "ROUTINE").length,
      maintenanceBlocked: items.filter((item) => item.releaseBlocked).length,
      inspectionReady: items.filter((item) => upper(item.task?.task_status) === "AWAITING_INSPECTION" && !item.releaseBlocked).length,
    },
  };
}

export default getHotelHousekeepingPriorityPlan;
