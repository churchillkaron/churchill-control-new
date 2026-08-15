import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

function required(value, field) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function rpcUnavailable(error, functionName) {
  return (
    error?.code === "PGRST202" ||
    String(error?.message || "").includes(functionName)
  );
}

export async function confirmPOSCashSessionAccounting({
  organizationId,
  entityId,
  applicationId,
  sessionId,
  actorStaffId,
  actorUserId,
  actorRole,
  notes = null,
}) {
  const functionName = "pos_confirm_cash_session_accounting_atomic";

  const { data, error } = await supabaseAdmin.rpc(functionName, {
    p_organization_id: required(organizationId, "organizationId"),
    p_entity_id: required(entityId, "entityId"),
    p_application_id: required(applicationId, "applicationId").toLowerCase(),
    p_session_id: required(sessionId, "sessionId"),
    p_actor_staff_id: required(actorStaffId, "actorStaffId"),
    p_actor_user_id: required(actorUserId, "actorUserId"),
    p_actor_role: String(actorRole || "").trim() || null,
    p_notes: String(notes || "").trim() || null,
  });

  if (error) {
    if (rpcUnavailable(error, functionName)) {
      const unavailable = new Error(
        "POS cash-session accounting governance is not deployed in the database"
      );
      unavailable.status = 503;
      throw unavailable;
    }

    throw error;
  }

  const result = data || {};
  const eventId = result.event_id || null;
  let dispatchPending = false;
  let dispatchError = null;

  if (eventId && !result.duplicate) {
    try {
      const dispatch = await runEventProcessors({
        organizationId,
        eventId,
        limit: 1,
      });

      dispatchPending =
        dispatch?.success === false ||
        Number(dispatch?.failed || 0) > 0;
      dispatchError = dispatchPending
        ? dispatch?.failures?.[0]?.error ||
          dispatch?.error ||
          "Accounting confirmation event dispatch incomplete"
        : null;
    } catch (dispatchFailure) {
      dispatchPending = true;
      dispatchError =
        dispatchFailure?.message ||
        "Accounting confirmation event dispatch failed";
    }
  }

  return {
    ...result,
    dispatch_pending: dispatchPending,
    dispatch_error: dispatchError,
  };
}

export default confirmPOSCashSessionAccounting;
