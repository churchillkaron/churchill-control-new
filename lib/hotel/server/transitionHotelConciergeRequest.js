const CONCIERGE_TRANSITIONS = Object.freeze({
  START: Object.freeze({
    fromStatus: "PENDING",
    toStatus: "IN_PROGRESS",
  }),
  COMPLETE: Object.freeze({
    fromStatus: "IN_PROGRESS",
    toStatus: "COMPLETED",
  }),
  CANCEL: Object.freeze({
    fromStatus: "PENDING",
    toStatus: "CANCELLED",
  }),
});

class ConciergeTransitionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ConciergeTransitionError";
    this.status = status;
  }
}

function requireValue(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new ConciergeTransitionError(
      `${label} is required`,
      400
    );
  }

  return normalized;
}

export async function transitionHotelConciergeRequest({
  supabase,
  organizationId,
  requestId,
  action,
}) {
  if (!supabase) {
    throw new ConciergeTransitionError(
      "Server database connection is required",
      500
    );
  }

  const scopedOrganizationId = requireValue(
    organizationId,
    "organizationId"
  );
  const scopedRequestId = requireValue(
    requestId,
    "requestId"
  );
  const normalizedAction = requireValue(
    action,
    "action"
  ).toUpperCase();
  const transition = CONCIERGE_TRANSITIONS[normalizedAction];

  if (!transition) {
    throw new ConciergeTransitionError(
      `Unsupported concierge action: ${normalizedAction}`,
      400
    );
  }

  const {
    data: request,
    error: requestError,
  } = await supabase
    .from("hotel_concierge_requests")
    .select("id, organization_id, property_id, guest_id, request_type, status")
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedRequestId)
    .maybeSingle();

  if (requestError) {
    throw requestError;
  }

  if (!request) {
    throw new ConciergeTransitionError(
      "Concierge request not found for this organization",
      404
    );
  }

  const currentStatus = String(
    request.status || ""
  ).toUpperCase();

  if (currentStatus !== transition.fromStatus) {
    throw new ConciergeTransitionError(
      `Request must be ${transition.fromStatus} before ${normalizedAction}`,
      409
    );
  }

  const {
    data: updatedRequest,
    error: updateError,
  } = await supabase
    .from("hotel_concierge_requests")
    .update({
      status: transition.toStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", scopedOrganizationId)
    .eq("id", scopedRequestId)
    .eq("status", transition.fromStatus)
    .select(`
      *,
      hotel_guests (
        first_name,
        last_name,
        full_name
      ),
      hotel_properties (
        name
      )
    `)
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updatedRequest) {
    throw new ConciergeTransitionError(
      "Concierge request state changed before the transition completed",
      409
    );
  }

  return updatedRequest;
}

export {
  CONCIERGE_TRANSITIONS,
  ConciergeTransitionError,
};

export default transitionHotelConciergeRequest;
