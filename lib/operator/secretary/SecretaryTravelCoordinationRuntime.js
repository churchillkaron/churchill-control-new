import { delegateSecretaryJob } from "@/lib/operator/secretary/SecretaryJobIntakeRuntime";

function text(value, limit = 8000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function compactObject(value = {}) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== ""),
  );
}

function travelRequest(payload = {}, context = {}) {
  const request = text(payload.request || payload.objective, 8000);
  const destination = text(payload.destination, 1000);
  if (!request && !destination) throw new Error("SECRETARY_TRAVEL_REQUEST_OR_DESTINATION_REQUIRED");

  const origin = text(payload.origin, 1000) || null;
  const purpose = text(payload.purpose, 2000) || null;
  const departAfter = text(payload.depart_after || payload.departAfter, 160) || null;
  const arriveBefore = text(payload.arrive_before || payload.arriveBefore, 160) || null;
  const returnAfter = text(payload.return_after || payload.returnAfter, 160) || null;
  const returnBefore = text(payload.return_before || payload.returnBefore, 160) || null;
  const timezone = text(payload.timezone || context.timezone, 120) || null;
  const travelerPartyId = text(payload.traveler_party_id || payload.travelerPartyId, 120) || null;
  const preferences = object(payload.preferences);
  const budget = object(payload.budget);
  const appointments = list(payload.appointments).slice(0, 30).map((item) => compactObject({
    title: text(item?.title, 500) || null,
    starts_at: text(item?.starts_at || item?.startsAt, 160) || null,
    ends_at: text(item?.ends_at || item?.endsAt, 160) || null,
    timezone: text(item?.timezone, 120) || timezone,
    location: text(item?.location, 1000) || null,
    contact_party_id: text(item?.contact_party_id || item?.contactPartyId, 120) || null,
    notes: text(item?.notes, 2000) || null,
  }));

  return compactObject({
    request: request || null,
    origin,
    destination: destination || null,
    purpose,
    depart_after: departAfter,
    arrive_before: arriveBefore,
    return_after: returnAfter,
    return_before: returnBefore,
    timezone,
    traveler_party_id: travelerPartyId,
    lodging_required: payload.lodging_required === true || payload.lodgingRequired === true,
    local_transport_required: payload.local_transport_required === true || payload.localTransportRequired === true,
    preferences,
    budget,
    appointments,
  });
}

function travelObjective(request) {
  const facts = [
    request.request ? `User request: ${request.request}` : null,
    request.origin ? `Origin: ${request.origin}` : null,
    request.destination ? `Destination: ${request.destination}` : null,
    request.purpose ? `Purpose: ${request.purpose}` : null,
    request.depart_after ? `Depart no earlier than: ${request.depart_after}` : null,
    request.arrive_before ? `Arrive no later than: ${request.arrive_before}` : null,
    request.return_after ? `Return no earlier than: ${request.return_after}` : null,
    request.return_before ? `Return no later than: ${request.return_before}` : null,
    request.timezone ? `Primary timezone: ${request.timezone}` : null,
    request.lodging_required ? "Lodging is required." : null,
    request.local_transport_required ? "Local transport is required." : null,
    request.appointments?.length ? `Known appointments: ${JSON.stringify(request.appointments)}` : null,
    Object.keys(request.preferences || {}).length ? `Preferences: ${JSON.stringify(request.preferences)}` : null,
    Object.keys(request.budget || {}).length ? `Budget guidance only, not spending authority: ${JSON.stringify(request.budget)}` : null,
  ].filter(Boolean);

  return [
    "Coordinate this travel or business visit as an Avantiqo Executive Secretary.",
    ...facts,
    "Research current route, schedule, lodging and local-transport options only where needed, using evidence rather than assumptions.",
    "Build a practical itinerary from confirmed facts, add exact known commitments to the native Avantiqo calendar, create useful reminders/tasks, and track confirmations or changes through completion.",
    "Never guess a missing date, time, timezone, traveler identity, destination detail, fare, availability or confirmation.",
    "Any external booking, reservation, ticket purchase, paid accommodation, paid transport, fare/rate acceptance, payment, cancellation fee, contract or other financial commitment must stop at review and requires explicit approval bound to that exact Secretary job step.",
    "Researching options, requesting availability, requesting prices and preparing an itinerary do not themselves authorize a booking or payment.",
  ].join(" ");
}

function defaultSuccessCriteria(request) {
  const criteria = [
    "Current travel, lodging and local-transport options are researched from evidence where required.",
    "The itinerary distinguishes confirmed facts from options and unresolved uncertainty.",
    "Exact known meetings, transfers or travel commitments are reflected in the native Avantiqo calendar without guessed times or timezones.",
    "Useful pre-travel, check-in, transfer, meeting and follow-up reminders/tasks are created when supported by known dates.",
    "Any external booking, reservation, ticket purchase, paid accommodation, paid transport, fare/rate acceptance or payment remains behind exact-step approval and is never inferred from budget guidance.",
    "Changes, confirmations and outstanding items remain owned by the Secretary until the coordination job is closed or cancelled.",
  ];
  if (request.appointments?.length) {
    criteria.push("All supplied appointments are accounted for in the itinerary or surfaced as conflicts/ambiguities for review.");
  }
  return criteria;
}

export async function delegateSecretaryTravelCoordination({ context, payload = {} } = {}) {
  const request = travelRequest(payload, context);
  const userCriteria = list(payload.success_criteria || payload.successCriteria)
    .map((item) => text(item, 1200))
    .filter(Boolean)
    .slice(0, 20);

  const approvalPolicy = {
    ...object(payload.approval_policy || payload.approvalPolicy),
    travel_booking_requires_exact_step_approval: true,
    travel_payment_requires_exact_step_approval: true,
    travel_commercial_commitment_requires_exact_step_approval: true,
    budget_is_guidance_not_authority: true,
  };

  const delegated = await delegateSecretaryJob({
    context,
    payload: {
      objective: travelObjective(request),
      success_criteria: [...defaultSuccessCriteria(request), ...userCriteria].slice(0, 30),
      autonomy_level: text(payload.autonomy_level || payload.autonomyLevel, 60) || "EXECUTE_WITH_GATES",
      approval_policy: approvalPolicy,
      entity_id: payload.entity_id || payload.entityId,
      timezone: request.timezone || payload.timezone,
      max_attempts: payload.max_attempts || payload.maxAttempts,
      metadata: {
        ...object(payload.metadata),
        job_kind: "TRAVEL_COORDINATION",
        travel_coordination: request,
        itinerary_store: "SECRETARY_JOB_AND_NATIVE_CALENDAR",
        external_booking_authority_created: false,
        payment_authority_created: false,
        external_authority_used: false,
      },
    },
  });

  return {
    ...delegated,
    travel_coordination: true,
    itinerary_store: "SECRETARY_JOB_AND_NATIVE_CALENDAR",
    external_booking_authority_created: false,
    payment_authority_created: false,
    external_authority_used: false,
  };
}

export default Object.freeze({
  coordinate: delegateSecretaryTravelCoordination,
});
