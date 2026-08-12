import { createApprovalLog } from "@/lib/shared/approvals/createApprovalLog";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CLOCK_IN_EXCEPTION_REFERENCE = "workforce_clock_in_exception";
export const CLOCK_IN_EXCEPTION_GRANT_TTL_MS = 10 * 60 * 1000;

const VALID_TARGETS = new Set(["passkey", "gps"]);
const REVIEW_STATUSES = ["pending", "approved", "consuming", "consumed", "rejected", "expired"];

function normalizeTargets(targets = []) {
  return [...new Set((Array.isArray(targets) ? targets : [targets])
    .map((target) => String(target || "").trim().toLowerCase())
    .filter((target) => VALID_TARGETS.has(target)))];
}

function normalizeRole(value) {
  return String(value || "staff").trim().toLowerCase();
}

function decodeRequestMetadata(notes) {
  try {
    const parsed = JSON.parse(String(notes || ""));
    if (parsed?.kind !== CLOCK_IN_EXCEPTION_REFERENCE) return null;

    return {
      reason: String(parsed.reason || "").trim(),
      targets: normalizeTargets(parsed.targets),
      failureCode: String(parsed.failureCode || "").trim() || null,
    };
  } catch {
    return null;
  }
}

function grantExpiresAt(request) {
  if (!request?.approved_at) return null;
  const approvedAt = new Date(request.approved_at);
  if (Number.isNaN(approvedAt.getTime())) return null;
  return new Date(approvedAt.getTime() + CLOCK_IN_EXCEPTION_GRANT_TTL_MS);
}

function grantExpired(request, now = new Date()) {
  const expiresAt = grantExpiresAt(request);
  return !expiresAt || now >= expiresAt;
}

async function loadMetadataMap({ organizationId, referenceIds }) {
  const ids = [...new Set((referenceIds || []).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabaseAdmin
    .from("approval_logs")
    .select("entity_id,notes,created_at")
    .eq("organization_id", organizationId)
    .eq("entity_type", CLOCK_IN_EXCEPTION_REFERENCE)
    .eq("to_status", "pending")
    .in("entity_id", ids)
    .order("created_at", { ascending: true });

  if (error) throw error;

  const metadata = new Map();
  for (const row of data || []) {
    if (metadata.has(row.entity_id)) continue;
    const parsed = decodeRequestMetadata(row.notes);
    if (parsed) metadata.set(row.entity_id, parsed);
  }

  return metadata;
}

function serializeRequest(request, metadata, now = new Date()) {
  const expiresAt = grantExpiresAt(request);
  const isExpired = request.status === "approved" && grantExpired(request, now);

  return {
    id: request.id,
    referenceId: request.reference_id,
    status: isExpired ? "expired" : request.status,
    requestedBy: request.requested_by,
    approvedBy: request.approved_by || null,
    rejectedBy: request.rejected_by || null,
    rejectionReason: request.rejection_reason || null,
    createdAt: request.created_at || null,
    approvedAt: request.approved_at || null,
    rejectedAt: request.rejected_at || null,
    expiresAt: expiresAt?.toISOString() || null,
    reason: metadata?.reason || null,
    targets: metadata?.targets || [],
    failureCode: metadata?.failureCode || null,
  };
}

async function expireRequests({ organizationId, requests, now = new Date() }) {
  const expiredIds = (requests || [])
    .filter((request) => request.status === "approved" && grantExpired(request, now))
    .map((request) => request.id);

  if (!expiredIds.length) return;

  const { error } = await supabaseAdmin
    .from("approval_requests")
    .update({ status: "expired" })
    .eq("organization_id", organizationId)
    .eq("reference_table", CLOCK_IN_EXCEPTION_REFERENCE)
    .in("id", expiredIds)
    .eq("status", "approved");

  if (error) throw error;
}

export async function requestClockInException({
  organizationId,
  staff,
  reason,
  targets,
  failureCode = null,
  now = new Date(),
}) {
  if (!organizationId || !staff?.id) {
    throw new Error("organizationId and staff required");
  }

  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 5 || cleanReason.length > 500) {
    const error = new Error("Explain the clock-in problem in 5 to 500 characters");
    error.status = 400;
    error.code = "CLOCK_IN_EXCEPTION_REASON_REQUIRED";
    throw error;
  }

  const cleanTargets = normalizeTargets(targets);
  if (!cleanTargets.length) {
    const error = new Error("A passkey or GPS exception target is required");
    error.status = 400;
    error.code = "CLOCK_IN_EXCEPTION_TARGET_REQUIRED";
    throw error;
  }

  const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc(
    "workforce_create_clock_in_exception_request",
    {
      p_organization_id: organizationId,
      p_staff_id: staff.id,
      p_reason: cleanReason,
      p_targets: cleanTargets,
      p_failure_code: String(failureCode || "").trim() || null,
      p_acted_role: normalizeRole(staff.role || staff.position),
    }
  );

  if (rpcError) throw rpcError;

  const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!rpcResult?.request_id) {
    const error = new Error("Clock-in exception request could not be created");
    error.status = 500;
    error.code = "CLOCK_IN_EXCEPTION_CREATE_FAILED";
    throw error;
  }

  const { data: approvalRequest, error: requestError } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reference_table", CLOCK_IN_EXCEPTION_REFERENCE)
    .eq("id", rpcResult.request_id)
    .single();

  if (requestError) throw requestError;

  const metadataMap = await loadMetadataMap({
    organizationId,
    referenceIds: [approvalRequest.reference_id],
  });

  return {
    created: Boolean(rpcResult.created),
    request: serializeRequest(
      approvalRequest,
      metadataMap.get(approvalRequest.reference_id),
      now
    ),
  };
}

export async function loadClockInExceptionState({
  organizationId,
  staffId,
  now = new Date(),
}) {
  if (!organizationId || !staffId) {
    return {
      requests: [],
      activeApprovedTargets: [],
      pendingTargets: [],
    };
  }

  const { data, error } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reference_table", CLOCK_IN_EXCEPTION_REFERENCE)
    .eq("requested_by", staffId)
    .in("status", REVIEW_STATUSES)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  await expireRequests({ organizationId, requests: data || [], now });
  const metadataMap = await loadMetadataMap({
    organizationId,
    referenceIds: (data || []).map((request) => request.reference_id),
  });

  const requests = (data || []).map((request) =>
    serializeRequest(request, metadataMap.get(request.reference_id), now)
  );

  const activeApprovedTargets = [...new Set(
    requests
      .filter((request) => request.status === "approved")
      .flatMap((request) => request.targets)
  )];

  const pendingTargets = [...new Set(
    requests
      .filter((request) => request.status === "pending")
      .flatMap((request) => request.targets)
  )];

  return {
    requests,
    latest: requests[0] || null,
    activeApprovedTargets,
    pendingTargets,
  };
}

export async function loadApprovedClockInExceptionGrants({
  organizationId,
  staffId,
  now = new Date(),
}) {
  const state = await loadClockInExceptionState({ organizationId, staffId, now });
  return state.requests.filter((request) => request.status === "approved");
}

export async function claimClockInExceptionGrants({
  organizationId,
  staffId,
  grantIds,
  now = new Date(),
}) {
  const ids = [...new Set((grantIds || []).filter(Boolean))];
  if (!ids.length) return [];

  const threshold = new Date(now.getTime() - CLOCK_IN_EXCEPTION_GRANT_TTL_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("approval_requests")
    .update({ status: "consuming" })
    .eq("organization_id", organizationId)
    .eq("reference_table", CLOCK_IN_EXCEPTION_REFERENCE)
    .eq("requested_by", staffId)
    .eq("status", "approved")
    .gte("approved_at", threshold)
    .in("id", ids)
    .select("*");

  if (error) throw error;

  const claimed = data || [];
  if (claimed.length !== ids.length) {
    if (claimed.length) {
      await supabaseAdmin
        .from("approval_requests")
        .update({ status: "approved" })
        .eq("organization_id", organizationId)
        .eq("requested_by", staffId)
        .eq("status", "consuming")
        .in("id", claimed.map((request) => request.id));
    }

    const conflict = new Error("Clock-in exception approval is no longer available");
    conflict.status = 409;
    conflict.code = "CLOCK_IN_EXCEPTION_ALREADY_USED";
    throw conflict;
  }

  return claimed;
}

export async function releaseClockInExceptionClaims({
  organizationId,
  staffId,
  claims,
}) {
  const ids = (claims || []).map((request) => request.id).filter(Boolean);
  if (!ids.length) return;

  const { error } = await supabaseAdmin
    .from("approval_requests")
    .update({ status: "approved" })
    .eq("organization_id", organizationId)
    .eq("requested_by", staffId)
    .eq("status", "consuming")
    .in("id", ids);

  if (error) throw error;
}

export async function consumeClockInExceptionClaims({
  organizationId,
  staff,
  claims,
  shiftId,
}) {
  const ids = [...new Set((claims || []).map((request) => request.id).filter(Boolean))];
  if (!ids.length) return;

  const { error } = await supabaseAdmin.rpc(
    "workforce_consume_clock_in_exception_claims",
    {
      p_organization_id: organizationId,
      p_staff_id: staff.id,
      p_request_ids: ids,
      p_shift_id: shiftId,
      p_acted_role: normalizeRole(staff.role || staff.position),
    }
  );

  if (error) {
    const conflict = new Error("Clock-in exception could not be finalized");
    conflict.status = 409;
    conflict.code = "CLOCK_IN_EXCEPTION_CONSUME_FAILED";
    conflict.cause = error;
    throw conflict;
  }
}

export async function loadClockInExceptionReviewQueue({
  organizationId,
  now = new Date(),
}) {
  const { data: requests, error } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("reference_table", CLOCK_IN_EXCEPTION_REFERENCE)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  await expireRequests({ organizationId, requests: requests || [], now });
  const metadataMap = await loadMetadataMap({
    organizationId,
    referenceIds: (requests || []).map((request) => request.reference_id),
  });

  const staffIds = [...new Set((requests || []).map((request) => request.requested_by).filter(Boolean))];
  let staffById = new Map();

  if (staffIds.length) {
    const { data: staffRows, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,name,email,role,position,department")
      .in("id", staffIds);

    if (staffError) throw staffError;
    staffById = new Map((staffRows || []).map((staff) => [staff.id, staff]));
  }

  const serialized = (requests || []).map((request) => ({
    ...serializeRequest(request, metadataMap.get(request.reference_id), now),
    staff: staffById.get(request.requested_by) || null,
  }));

  return {
    pending: serialized.filter((request) => request.status === "pending"),
    recent: serialized.filter((request) => request.status !== "pending").slice(0, 25),
  };
}

export async function reviewClockInException({
  organizationId,
  requestId,
  manager,
  decision,
  notes,
  now = new Date(),
}) {
  const normalizedDecision = String(decision || "").trim().toLowerCase();
  const cleanNotes = String(notes || "").trim();

  if (!requestId || !["approved", "rejected"].includes(normalizedDecision)) {
    const error = new Error("Clock-in exception request and decision required");
    error.status = 400;
    throw error;
  }

  if (cleanNotes.length < 3 || cleanNotes.length > 500) {
    const error = new Error("Manager review note must be 3 to 500 characters");
    error.status = 400;
    throw error;
  }

  const { data: request, error } = await supabaseAdmin
    .from("approval_requests")
    .select("*")
    .eq("id", requestId)
    .eq("organization_id", organizationId)
    .eq("reference_table", CLOCK_IN_EXCEPTION_REFERENCE)
    .eq("status", "pending")
    .maybeSingle();

  if (error) throw error;
  if (!request) {
    const notFound = new Error("Pending clock-in exception request not found");
    notFound.status = 404;
    throw notFound;
  }

  if (request.requested_by === manager?.id) {
    const selfApproval = new Error("Clock-in exceptions require approval from another manager");
    selfApproval.status = 409;
    selfApproval.code = "CLOCK_IN_EXCEPTION_SELF_APPROVAL_DENIED";
    throw selfApproval;
  }

  const patch = normalizedDecision === "approved"
    ? {
        status: "approved",
        current_step: 1,
        approved_by: manager?.id || null,
        approved_at: now.toISOString(),
      }
    : {
        status: "rejected",
        rejected_by: manager?.id || null,
        rejected_at: now.toISOString(),
        rejection_reason: cleanNotes,
      };

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("approval_requests")
    .update(patch)
    .eq("id", request.id)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) {
    const conflict = new Error("Clock-in exception was already reviewed");
    conflict.status = 409;
    conflict.code = "CLOCK_IN_EXCEPTION_ALREADY_REVIEWED";
    throw conflict;
  }

  await createApprovalLog({
    organizationId,
    entityType: CLOCK_IN_EXCEPTION_REFERENCE,
    entityId: updated.reference_id,
    fromStatus: "pending",
    toStatus: normalizedDecision,
    actedBy: manager?.id || null,
    role: normalizeRole(manager?.role || manager?.position || "manager"),
    notes: cleanNotes,
  });

  const metadataMap = await loadMetadataMap({
    organizationId,
    referenceIds: [updated.reference_id],
  });

  return serializeRequest(updated, metadataMap.get(updated.reference_id), now);
}
