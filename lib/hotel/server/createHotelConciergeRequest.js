class HotelConciergeRequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "HotelConciergeRequestError";
    this.status = status;
  }
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new HotelConciergeRequestError(
      `${label} is required`,
      400
    );
  }

  return normalized;
}

function normalizeRequestType(value) {
  const normalized = requireValue(
    value,
    "requestType"
  )
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!normalized || normalized.length > 80) {
    throw new HotelConciergeRequestError(
      "requestType must contain a valid service category",
      400
    );
  }

  return normalized;
}

export async function createHotelConciergeRequest({
  supabase,
  organizationId,
  propertyId,
  guestId,
  requestType,
  details = null,
}) {
  if (!supabase) {
    throw new HotelConciergeRequestError(
      "Server database connection is required",
      500
    );
  }

  const scopedOrganizationId = requireValue(
    organizationId,
    "organizationId"
  );
  const scopedPropertyId = requireValue(
    propertyId,
    "propertyId"
  );
  const scopedGuestId = requireValue(
    guestId,
    "guestId"
  );
  const normalizedRequestType = normalizeRequestType(
    requestType
  );
  const normalizedDetails = String(details || "").trim();

  if (normalizedDetails.length > 2000) {
    throw new HotelConciergeRequestError(
      "details must be 2000 characters or fewer",
      400
    );
  }

  const [propertyResult, guestResult] = await Promise.all([
    supabase
      .from("hotel_properties")
      .select("id, organization_id, name")
      .eq("organization_id", scopedOrganizationId)
      .eq("id", scopedPropertyId)
      .maybeSingle(),
    supabase
      .from("hotel_guests")
      .select("id, organization_id, first_name, last_name")
      .eq("organization_id", scopedOrganizationId)
      .eq("id", scopedGuestId)
      .maybeSingle(),
  ]);

  if (propertyResult.error) {
    throw propertyResult.error;
  }

  if (guestResult.error) {
    throw guestResult.error;
  }

  if (!propertyResult.data) {
    throw new HotelConciergeRequestError(
      "Hotel property not found for this organization",
      404
    );
  }

  if (!guestResult.data) {
    throw new HotelConciergeRequestError(
      "Hotel guest not found for this organization",
      404
    );
  }

  const now = new Date().toISOString();

  const {
    data: request,
    error: insertError,
  } = await supabase
    .from("hotel_concierge_requests")
    .insert({
      organization_id: scopedOrganizationId,
      property_id: scopedPropertyId,
      guest_id: scopedGuestId,
      request_type: normalizedRequestType,
      details: normalizedDetails || null,
      status: "PENDING",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return request;
}

export {
  HotelConciergeRequestError,
  normalizeRequestType,
};

export default createHotelConciergeRequest;
