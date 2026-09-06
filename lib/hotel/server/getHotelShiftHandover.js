import { evaluateHotelDepartureReadiness } from "@/lib/hotel/server/getHotelDepartureReadiness";
import { getHotelOperationalDate } from "@/lib/hotel/server/getHotelOperationalDate";

const ACTIVE_HOUSEKEEPING_STATUSES = Object.freeze(["PENDING", "IN_PROGRESS", "AWAITING_INSPECTION"]);
const ACTIVE_CHANNEL_SYNC_STATUSES = Object.freeze(["FAILED", "RETRY_REQUIRED"]);

function clean(value) { return String(value ?? "").trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function dateValue(value) { return clean(value).slice(0, 10); }
function guestName(booking) { return booking?.hotel_guests?.full_name || "Guest"; }
function roomLabel(booking) { return booking?.hotel_rooms?.room_number ? `Room ${booking.hotel_rooms.room_number}` : "Room unassigned"; }
function sourceKey(type, id, code) { return `${type}:${id}:${code}`; }

function routeForDeparture(code) {
  if (["FOLIO_BALANCE_OPEN", "PAYMENT_PENDING", "FINANCE_EVIDENCE_MISSING"].includes(code)) return "hotel-payments";
  if (["FOLIO_OPEN_ZERO_BALANCE", "EARLY_DEPARTURE_REVIEW_REQUIRED"].includes(code)) return "stay-control";
  if (code === "OPERATIONAL_DAY_REQUIRED") return "hotel-operational-day";
  return "front-desk";
}

function workItem({ sourceType, sourceId, code, severity = "ACTION", area, title, detail, route, businessDate, bookingId = null, roomId = null, propertyId }) {
  return Object.freeze({
    sourceKey: sourceKey(sourceType, sourceId, code),
    sourceType,
    sourceId,
    code,
    severity,
    area,
    title,
    detail,
    route,
    businessDate,
    bookingId,
    roomId,
    propertyId,
  });
}

export async function getHotelShiftHandover({ supabase, organizationId, propertyId }) {
  if (!supabase) throw new Error("Server database connection is required");
  const organization = clean(organizationId);
  const property = clean(propertyId);
  if (!organization) throw new Error("organizationId required");
  if (!property) throw new Error("propertyId required");

  const operationalDate = await getHotelOperationalDate({ organizationId: organization, propertyId: property });
  const businessDate = operationalDate.businessDate;

  const [bookingsResult, foliosResult, housekeepingResult, channelResult, contextResult] = await Promise.all([
    supabase.from("hotel_bookings").select("*,hotel_guests(full_name),hotel_rooms(room_number,status)").eq("organization_id", organization).eq("property_id", property),
    supabase.from("hotel_folios").select("id,booking_id,currency_code,status,closed_at").eq("organization_id", organization).eq("property_id", property),
    supabase.from("hotel_housekeeping_tasks").select("id,room_id,assigned_to,task_status,priority,task_date,notes,completed_at,created_at,updated_at,hotel_rooms!inner(room_number,status,property_id)").eq("organization_id", organization).eq("hotel_rooms.property_id", property).in("task_status", ACTIVE_HOUSEKEEPING_STATUSES),
    supabase.from("hotel_channel_sync_jobs").select("id,status,last_error,created_at,queued_at,started_at,completed_at").eq("organization_id", organization).eq("property_id", property).in("status", ACTIVE_CHANNEL_SYNC_STATUSES),
    supabase.from("hotel_shift_handover_context").select("*").eq("organization_id", organization).eq("property_id", property),
  ]);
  for (const result of [bookingsResult, foliosResult, housekeepingResult, channelResult, contextResult]) if (result.error) throw result.error;

  const bookings = bookingsResult.data || [];
  const folios = foliosResult.data || [];
  const bookingIds = bookings.map((booking) => booking.id).filter(Boolean);
  const folioIds = folios.map((folio) => folio.id).filter(Boolean);
  const [linesResult, transactionsResult] = await Promise.all([
    folioIds.length
      ? supabase.from("hotel_folio_lines").select("folio_id,amount,tax_amount,voided_at").eq("organization_id", organization).in("folio_id", folioIds)
      : Promise.resolve({ data: [], error: null }),
    bookingIds.length
      ? supabase.from("hotel_payment_transactions").select("booking_id,status,transaction_type,processor_mode,finance_payment_id,amount,applied_amount,refunded_amount,currency_code").eq("organization_id", organization).in("booking_id", bookingIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (linesResult.error) throw linesResult.error;
  if (transactionsResult.error) throw transactionsResult.error;

  const folioByBooking = new Map(folios.map((folio) => [folio.booking_id, folio]));
  const linesByFolio = new Map();
  for (const line of linesResult.data || []) {
    if (!linesByFolio.has(line.folio_id)) linesByFolio.set(line.folio_id, []);
    linesByFolio.get(line.folio_id).push(line);
  }
  const transactionsByBooking = new Map();
  for (const transaction of transactionsResult.data || []) {
    if (!transactionsByBooking.has(transaction.booking_id)) transactionsByBooking.set(transaction.booking_id, []);
    transactionsByBooking.get(transaction.booking_id).push(transaction);
  }

  const items = [];
  if (!operationalDate.configured) {
    items.push(workItem({
      sourceType: "property", sourceId: property, code: "OPERATIONAL_DAY_UNCONFIGURED", severity: "CRITICAL", area: "GOVERNANCE",
      title: "Property operating day is not configured",
      detail: "Timezone, business-day cutoff and explicit configuration must be governed before date-sensitive Hotel work can be trusted.",
      route: "hotel-operational-day", businessDate, propertyId: property,
    }));
  }

  for (const booking of bookings) {
    const bookingStatus = upper(booking.status);
    const arrivalDate = dateValue(booking.check_in_date);
    const departureDate = dateValue(booking.check_out_date);
    if (operationalDate.configured && bookingStatus === "RESERVED" && arrivalDate && arrivalDate <= businessDate) {
      items.push(workItem({
        sourceType: "booking", sourceId: booking.id, code: "ARRIVAL_NOT_RESOLVED", severity: arrivalDate < businessDate ? "CRITICAL" : "ACTION", area: "FRONT_DESK",
        title: `${guestName(booking)} still needs an arrival decision`,
        detail: `${roomLabel(booking)} · Arrival ${arrivalDate}. Check in, preserve the reservation, or record a governed no-show when eligible.`,
        route: "front-desk", businessDate, bookingId: booking.id, roomId: booking.room_id, propertyId: property,
      }));
    }
    if (bookingStatus === "CHECKED_IN") {
      const folio = folioByBooking.get(booking.id) || null;
      const readiness = evaluateHotelDepartureReadiness({
        booking,
        folio,
        folioLines: folio ? linesByFolio.get(folio.id) || [] : [],
        transactions: transactionsByBooking.get(booking.id) || [],
        businessDate: operationalDate.configured ? businessDate : null,
      });
      const due = operationalDate.configured && departureDate && departureDate <= businessDate;
      if (due) {
        items.push(workItem({
          sourceType: "booking", sourceId: booking.id, code: "DEPARTURE_NOT_RESOLVED", severity: departureDate < businessDate ? "CRITICAL" : "ACTION", area: "FRONT_DESK",
          title: `${guestName(booking)} is still in house`,
          detail: `${roomLabel(booking)} · Scheduled departure ${departureDate}. Check out or explicitly extend the stay.`,
          route: "front-desk", businessDate, bookingId: booking.id, roomId: booking.room_id, propertyId: property,
        }));
      }
      for (const blocker of readiness.blockers || []) {
        if (["BOOKING_NOT_IN_HOUSE"].includes(blocker.code)) continue;
        if (blocker.code === "OPERATIONAL_DAY_REQUIRED" && !operationalDate.configured) continue;
        items.push(workItem({
          sourceType: "booking", sourceId: booking.id, code: blocker.code, severity: "ACTION", area: ["FOLIO_BALANCE_OPEN", "FOLIO_OPEN_ZERO_BALANCE", "PAYMENT_PENDING", "FINANCE_EVIDENCE_MISSING"].includes(blocker.code) ? "PAYMENTS" : "FRONT_DESK",
          title: `${guestName(booking)} · ${blocker.label}`,
          detail: `${roomLabel(booking)} · ${blocker.detail}`,
          route: routeForDeparture(blocker.code), businessDate, bookingId: booking.id, roomId: booking.room_id, propertyId: property,
        }));
      }
    }
    if (bookingStatus === "CHECKED_OUT") {
      const folio = folioByBooking.get(booking.id);
      if (folio && upper(folio.status) === "OPEN") {
        items.push(workItem({
          sourceType: "folio", sourceId: folio.id, code: "OPEN_DEPARTURE_FOLIO", severity: "CRITICAL", area: "PAYMENTS",
          title: `${guestName(booking)} checked out with an open folio`,
          detail: `${roomLabel(booking)} · Physical departure is recorded but the guest account remains open.`,
          route: "stay-control", businessDate, bookingId: booking.id, roomId: booking.room_id, propertyId: property,
        }));
      }
    }
  }

  for (const task of housekeepingResult.data || []) {
    const state = upper(task.task_status);
    const room = task?.hotel_rooms?.room_number ? `Room ${task.hotel_rooms.room_number}` : "Room";
    items.push(workItem({
      sourceType: "housekeeping", sourceId: task.id, code: `HOUSEKEEPING_${state}`, severity: state === "IN_PROGRESS" || state === "AWAITING_INSPECTION" ? "ACTION" : "INFO", area: "HOUSEKEEPING",
      title: `${room} turnover ${state.toLowerCase().replaceAll("_", " ")}`,
      detail: state === "AWAITING_INSPECTION" ? "Cleaning is complete but the room still needs inspection before release." : state === "IN_PROGRESS" ? "Housekeeping is actively turning the room; the next shift should not assume it is ready." : "Housekeeping work is queued and still open.",
      route: "housekeeping", businessDate, roomId: task.room_id || null, propertyId: property,
    }));
  }

  for (const job of channelResult.data || []) {
    items.push(workItem({
      sourceType: "channel", sourceId: job.id, code: "CHANNEL_SYNC_EXCEPTION", severity: "ACTION", area: "CHANNELS",
      title: "Channel synchronization needs attention",
      detail: job.last_error || "An OTA/channel synchronization job is failed or requires retry.",
      route: "channel-reservations", businessDate, propertyId: property,
    }));
  }

  const contextByKey = new Map((contextResult.data || []).map((context) => [context.source_key, context]));
  const exceptions = items.map((item) => ({ ...item, context: contextByKey.get(item.sourceKey) || null }));
  const summary = {
    total: exceptions.length,
    critical: exceptions.filter((item) => item.severity === "CRITICAL").length,
    unowned: exceptions.filter((item) => !item.context?.assigned_staff_account_id).length,
    acknowledged: exceptions.filter((item) => Boolean(item.context?.acknowledged_at)).length,
  };

  return Object.freeze({
    operationalDate: {
      businessDate: operationalDate.businessDate,
      propertyDate: operationalDate.propertyDate,
      timezone: operationalDate.timezone,
      cutoffMinutes: operationalDate.cutoffMinutes,
      configured: operationalDate.configured,
      compatibilityFallback: operationalDate.compatibilityFallback,
    },
    exceptions,
    summary,
  });
}

export default getHotelShiftHandover;
