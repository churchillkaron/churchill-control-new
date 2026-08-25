import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function iso(value, field) {
  const clean = text(value, 120);
  if (!clean) throw new Error(`SECRETARY_${field.toUpperCase()}_REQUIRED`);
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

export async function bookSecretaryCalendarEventAtomic({
  organizationId,
  entityId = null,
  ownerPartyId = null,
  contactPartyId = null,
  title,
  description = null,
  eventType = "APPOINTMENT",
  status = "CONFIRMED",
  startsAt,
  endsAt,
  timezone = "UTC",
  allDay = false,
  location = null,
  source = "secretary",
  createdByPartyId = null,
  updatedByPartyId = null,
  metadata = {},
} = {}) {
  const organization = text(organizationId, 120);
  const eventTitle = text(title, 500);
  const starts = iso(startsAt, "starts_at");
  const ends = iso(endsAt, "ends_at");
  if (!organization) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  if (!eventTitle) throw new Error("SECRETARY_CALENDAR_TITLE_REQUIRED");
  if (Date.parse(ends) <= Date.parse(starts)) throw new Error("SECRETARY_CALENDAR_END_BEFORE_START");

  const result = await supabaseAdmin.rpc("secretary_book_calendar_event", {
    p_organization_id: organization,
    p_entity_id: text(entityId, 120) || null,
    p_owner_party_id: text(ownerPartyId, 120) || null,
    p_contact_party_id: text(contactPartyId, 120) || null,
    p_title: eventTitle,
    p_description: text(description, 4000) || null,
    p_event_type: text(eventType, 40).toUpperCase() || "APPOINTMENT",
    p_status: text(status, 40).toUpperCase() || "CONFIRMED",
    p_starts_at: starts,
    p_ends_at: ends,
    p_timezone: text(timezone, 120) || "UTC",
    p_all_day: allDay === true,
    p_location: text(location, 1000) || null,
    p_source: text(source, 120) || "secretary",
    p_created_by_party_id: text(createdByPartyId, 120) || null,
    p_updated_by_party_id: text(updatedByPartyId, 120) || null,
    p_metadata: object(metadata),
  });

  if (result.error) {
    const message = text(result.error.message || result.error.details || result.error, 1200);
    if (message.includes("SECRETARY_CALENDAR_SLOT_UNAVAILABLE")) {
      const error = new Error("SECRETARY_CALENDAR_SLOT_UNAVAILABLE");
      error.status = 409;
      throw error;
    }
    throw result.error;
  }

  const event = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!event?.id) throw new Error("SECRETARY_CALENDAR_ATOMIC_BOOKING_RESULT_REQUIRED");
  return event;
}

export async function createSecretaryCalendarEventAtomic({ context, payload = {} } = {}) {
  const actorPartyId = text(
    context?.actor?.partyId || context?.actor?.party_id || context?.metadata?.partyId,
    120,
  ) || null;
  const event = await bookSecretaryCalendarEventAtomic({
    organizationId: context?.organizationId,
    entityId: text(payload.entity_id || payload.entityId, 120) || context?.entityId || null,
    ownerPartyId: text(payload.owner_party_id || payload.ownerPartyId, 120) || actorPartyId,
    contactPartyId: text(payload.contact_party_id || payload.contactPartyId, 120) || null,
    title: payload.title,
    description: payload.description,
    eventType: payload.event_type || payload.eventType || "MEETING",
    status: payload.status || "CONFIRMED",
    startsAt: payload.starts_at || payload.startsAt,
    endsAt: payload.ends_at || payload.endsAt,
    timezone: payload.timezone || context?.timezone || "UTC",
    allDay: payload.all_day === true || payload.allDay === true,
    location: payload.location,
    source: "secretary",
    createdByPartyId: actorPartyId,
    updatedByPartyId: actorPartyId,
    metadata: payload.metadata,
  });
  return { status: "completed", event };
}

export default createSecretaryCalendarEventAtomic;
