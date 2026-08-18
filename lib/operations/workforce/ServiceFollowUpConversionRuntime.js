import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function followUpPayload(workRequest = {}) {
  return workRequest?.attributes?.service_follow_up || null;
}

export async function convertApprovedServiceFollowUpToWorkOrder({
  context,
  workRequestId,
}) {
  const id = cleanText(workRequestId);
  if (!context?.organization_id || !id) {
    const error = new Error("Organization and work request are required.");
    error.status = 400;
    throw error;
  }

  const detail = await serverOperationsApi.detail({
    capabilityId: "work-requests",
    id,
    context,
  });

  if (detail.status >= 400 || !detail.body?.ok) {
    const error = new Error(detail.body?.error || "Service follow-up work request was not found.");
    error.status = detail.status || 404;
    throw error;
  }

  const workRequest = detail.body.record || null;
  const status = cleanText(workRequest?.status)?.toLowerCase();
  if (status !== "approved") {
    const error = new Error("Service follow-up work request must be approved before work-order creation.");
    error.status = 409;
    throw error;
  }

  if (cleanText(workRequest?.source_domain) !== "service-management"
    || cleanText(workRequest?.source_type) !== "service-follow-up") {
    const error = new Error("Only Service Management follow-up requests can use this conversion.");
    error.status = 409;
    throw error;
  }

  const followUp = followUpPayload(workRequest);
  if (!followUp?.occurrence_id || !followUp?.originating_work_order_id) {
    const error = new Error("Service follow-up request is missing canonical service lineage.");
    error.status = 409;
    throw error;
  }

  const serviceName = cleanText(followUp.service_name) || "Service follow-up";
  const customerName = cleanText(followUp.customer_name);
  const customerLocation = cleanText(followUp.customer_location_name);
  const idempotencyKey = `service-follow-up-work-order:${workRequest.id}`;

  const response = await serverOperationsApi.execute({
    capabilityId: "work-orders",
    command: "create",
    context,
    payload: {
      name: `${serviceName} — Follow-up${customerName ? ` — ${customerName}` : ""}`,
      description:
        cleanText(followUp.notes)
        || cleanText(workRequest.description)
        || `Approved follow-up work for ${serviceName}.`,
      priority: followUp.outcome === "issue_found" ? "high" : "normal",
      source_domain: "service-management",
      source_type: "service-follow-up-work-request",
      source_id: workRequest.id,
      idempotency_key: idempotencyKey,
      attributes: {
        service_follow_up: {
          ...followUp,
          schema_version: 1,
          work_request_id: workRequest.id,
          work_request_status: workRequest.status,
          approved_follow_up: true,
          converted_at: new Date().toISOString(),
          customer_location_name: customerLocation,
        },
      },
    },
  });

  if (response.status >= 400 || !response.body?.ok) {
    const error = new Error(response.body?.error || "Unable to create follow-up work order.");
    error.status = response.status || 500;
    throw error;
  }

  const workOrder = response.body.execution?.result || null;
  if (!workOrder?.id) {
    const error = new Error("Follow-up work-order creation returned no record id.");
    error.status = 500;
    throw error;
  }

  return {
    work_request: workRequest,
    work_order: workOrder,
    idempotent_replay: Boolean(response.body.execution?.idempotent_replay),
  };
}

export default convertApprovedServiceFollowUpToWorkOrder;
