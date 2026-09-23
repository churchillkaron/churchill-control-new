import { supabaseAdmin } from "../../../shared/supabase/admin.js";
import { intelligenceModalOverflowRequestFingerprint } from "./IntelligenceModalOverflowFingerprintPolicy.js";
import {
  assertIntelligenceModalOverflowCeiling,
  intelligenceModalOverflowMinimumCeilingThb,
} from "./IntelligenceModalOverflowCostPolicy.js";

const CONTRACT = "AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_V1";
const OWNER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const ALLOWED_REASONS = new Set([
  "LOCAL_CONTEXT_CAPACITY_EXCEEDED",
  "LOCAL_OUTPUT_CAPACITY_EXCEEDED",
  "LOCAL_GPU_MEMORY_INSUFFICIENT",
  "LOCAL_LARGE_MODEL_CAPABILITY_REQUIRED",
]);

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizedRole(value) {
  return text(value, 120).toUpperCase().replace(/[\s-]+/g, "_");
}
function explanation(reasonCode, lane) {
  const laneLabel = lane === "deep" ? "Modal Deep" : "Modal Fast";
  if (reasonCode === "LOCAL_OUTPUT_CAPACITY_EXCEEDED") {
    return `${laneLabel} overflow requested because the required output exceeds the bounded Node01 output capacity.`;
  }
  if (reasonCode === "LOCAL_CONTEXT_CAPACITY_EXCEEDED") {
    return `${laneLabel} overflow requested because the governed request exceeds the bounded Node01 context capacity.`;
  }
  if (reasonCode === "LOCAL_GPU_MEMORY_INSUFFICIENT") {
    return `${laneLabel} overflow requested because an owned local execution attempt produced verified GPU memory insufficiency evidence.`;
  }
  return `${laneLabel} overflow requested because a server-side local assessment proved that this job requires the governed larger-model lane.`;
}
function safeLocalEvidence(value = {}) {
  const source = object(value);
  return {
    fits: source.fits === true,
    reason_code: text(source.reason_code, 120) || null,
    lane: text(source.lane, 40) || null,
    requested_output_tokens: Number(source.requested_output_tokens || 0),
    output_cap_tokens: Number(source.output_cap_tokens || 0),
    estimated_prompt_tokens: Number(source.estimated_prompt_tokens || 0),
    context_safety_tokens: Number(source.context_safety_tokens || 0),
    estimated_total_tokens: Number(source.estimated_total_tokens || 0),
    context_cap_tokens: Number(source.context_cap_tokens || 0),
    local_attempted: source.local_attempted === true,
    local_failure_code: text(source.local_failure_code, 500) || null,
    local_assessment_reference: text(source.local_assessment_reference, 500) || null,
    raw_prompt_persisted: false,
  };
}

export async function createIntelligenceModalOverflowProposal({
  organizationId,
  usageId,
  partyId = null,
  entityId = null,
  requestedByUserId = null,
  capability,
  lane,
  reasonCode,
  localEvidence = {},
  requestFingerprint = null,
  requestInput = null,
  expiryMinutes = 30,
} = {}) {
  const org = text(organizationId, 120);
  const usage = text(usageId, 240);
  const cap = text(capability, 200);
  const executionLane = text(lane, 40).toLowerCase();
  const reason = text(reasonCode, 120).toUpperCase();
  const fingerprint = text(requestFingerprint, 128) || intelligenceModalOverflowRequestFingerprint(requestInput || {}, executionLane);
  if (!org) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_ORGANIZATION_REQUIRED");
  if (!usage) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_USAGE_REQUIRED");
  if (!cap) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_CAPABILITY_REQUIRED");
  if (!fingerprint) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_FINGERPRINT_REQUIRED");
  if (!["fast", "deep"].includes(executionLane)) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_LANE_INVALID");
  if (!ALLOWED_REASONS.has(reason)) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_REASON_INVALID");

  const existing = await supabaseAdmin
    .from("intelligence_modal_overflow_proposals")
    .select("*")
    .eq("organization_id", org)
    .eq("usage_id", usage)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (
      text(existing.data.capability) !== cap ||
      text(existing.data.execution_lane).toLowerCase() !== executionLane ||
      text(existing.data.reason_code).toUpperCase() !== reason ||
      text(existing.data.request_fingerprint, 128) !== fingerprint
    ) {
      throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_IDEMPOTENCY_MISMATCH");
    }
    return existing.data;
  }

  const ceiling = intelligenceModalOverflowMinimumCeilingThb(executionLane);
  const costPolicy = assertIntelligenceModalOverflowCeiling({ lane: executionLane, ceilingThb: ceiling });
  const ttlMinutes = Math.max(5, Math.min(Number(expiryMinutes) || 30, 120));
  const row = {
    organization_id: org,
    usage_id: usage,
    request_fingerprint: fingerprint,
    party_id: partyId || null,
    entity_id: entityId || null,
    requested_by_user_id: requestedByUserId || null,
    capability: cap,
    execution_lane: executionLane,
    reason_code: reason,
    explanation: explanation(reason, executionLane),
    local_evidence: safeLocalEvidence(localEvidence),
    proposed_supplier_cost_thb: ceiling,
    cost_policy: {
      ...costPolicy,
      contract: "AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_BOUNDED_COST_V1",
    },
    status: "PROPOSED",
    expires_at: new Date(Date.now() + ttlMinutes * 60_000).toISOString(),
  };
  const inserted = await supabaseAdmin
    .from("intelligence_modal_overflow_proposals")
    .insert(row)
    .select("*")
    .single();
  if (inserted.error?.code === "23505") {
    const raced = await supabaseAdmin
      .from("intelligence_modal_overflow_proposals")
      .select("*")
      .eq("organization_id", org)
      .eq("usage_id", usage)
      .single();
    if (raced.error) throw raced.error;
    return raced.data;
  }
  if (inserted.error) throw inserted.error;
  return inserted.data;
}

export async function getIntelligenceModalOverflowProposal({ organizationId, proposalId } = {}) {
  const result = await supabaseAdmin
    .from("intelligence_modal_overflow_proposals")
    .select("*")
    .eq("organization_id", text(organizationId, 120))
    .eq("id", text(proposalId, 120))
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function approveIntelligenceModalOverflowProposal({
  organizationId,
  proposalId,
  approvedBy,
  role,
} = {}) {
  if (!OWNER_ROLES.has(normalizedRole(role))) {
    throw new Error("INTELLIGENCE_MODAL_OVERFLOW_OWNER_APPROVAL_REQUIRED");
  }
  const actor = text(approvedBy, 120);
  if (!actor) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_APPROVER_REQUIRED");
  const result = await supabaseAdmin.rpc("approve_intelligence_modal_overflow_proposal", {
    p_organization_id: text(organizationId, 120),
    p_proposal_id: text(proposalId, 120),
    p_approved_by: actor,
  });
  if (result.error) throw result.error;
  if (!result.data?.approval_id) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_BINDING_INVALID");
  return result.data;
}

export async function rejectIntelligenceModalOverflowProposal({ organizationId, proposalId } = {}) {
  const result = await supabaseAdmin
    .from("intelligence_modal_overflow_proposals")
    .update({ status: "REJECTED", updated_at: new Date().toISOString() })
    .eq("organization_id", text(organizationId, 120))
    .eq("id", text(proposalId, 120))
    .eq("status", "PROPOSED")
    .select("id,organization_id,status,updated_at")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function resolveApprovedIntelligenceModalOverflowBinding({ organizationId, proposalId } = {}) {
  const proposal = await getIntelligenceModalOverflowProposal({ organizationId, proposalId });
  if (!proposal) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_NOT_FOUND");
  const status = text(proposal.status, 40).toUpperCase();
  if (status !== "APPROVED") {
    const error = new Error(`INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_NOT_APPROVED:${status || "NONE"}`);
    error.code = "INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_NOT_APPROVED";
    error.proposal = publicIntelligenceModalOverflowProposal(proposal);
    throw error;
  }
  if (!proposal.approval_id) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_APPROVAL_ID_REQUIRED");
  const approval = await supabaseAdmin
    .from("modal_compute_approvals")
    .select("id,status,expires_at,maximum_supplier_cost_thb,used_calls,maximum_calls")
    .eq("organization_id", text(organizationId, 120))
    .eq("id", proposal.approval_id)
    .maybeSingle();
  if (approval.error) throw approval.error;
  if (!approval.data) throw new Error("INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_NOT_FOUND");
  const approvalStatus = text(approval.data.status, 40).toUpperCase();
  if (approvalStatus !== "APPROVED") {
    throw new Error(`INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_NOT_ACTIVE:${approvalStatus || "NONE"}`);
  }
  if (Date.parse(approval.data.expires_at || 0) <= Date.now()) {
    throw new Error("INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_EXPIRED");
  }
  if (Number(approval.data.used_calls || 0) !== 0 || Number(approval.data.maximum_calls || 0) !== 1) {
    throw new Error("INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_ALREADY_USED_OR_INVALID");
  }
  return {
    modal_overflow_proposal_id: proposal.id,
    modal_compute_approval_id: proposal.approval_id,
    execution_lane: text(proposal.execution_lane, 40).toLowerCase(),
    intelligence_modal_overflow_reason_code: text(proposal.reason_code, 120).toUpperCase(),
    modal_requested_supplier_cost_thb: Number(proposal.proposed_supplier_cost_thb),
    intelligence_modal_overflow_request_fingerprint: text(proposal.request_fingerprint, 128),
    intelligence_modal_overflow_local_evidence: safeLocalEvidence(proposal.local_evidence),
    intelligence_modal_overflow_proposal_approved: true,
  };
}

export function publicIntelligenceModalOverflowProposal(proposal = {}) {
  const source = object(proposal);
  return {
    contract: CONTRACT,
    proposal_id: text(source.id, 120) || null,
    request_fingerprint: text(source.request_fingerprint, 128) || null,
    status: text(source.status, 40).toUpperCase() || null,
    execution_lane: text(source.execution_lane, 40).toLowerCase() || null,
    reason_code: text(source.reason_code, 120).toUpperCase() || null,
    explanation: text(source.explanation, 1000) || null,
    maximum_supplier_cost_thb: Number(source.proposed_supplier_cost_thb || 0),
    expires_at: source.expires_at || null,
    approval_id: source.approval_id || null,
    authorization_effect: "NONE_UNTIL_OWNER_APPROVES",
    automatic_execution: false,
    raw_prompt_persisted: false,
  };
}

export function intelligenceModalOverflowApprovalRequiredError(proposal = {}) {
  const publicProposal = publicIntelligenceModalOverflowProposal(proposal);
  const error = new Error("AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REQUIRED");
  error.code = "AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_APPROVAL_REQUIRED";
  error.status = 409;
  error.approval_required = true;
  error.modal_overflow_proposal = publicProposal;
  error.authorization_effect = "NONE";
  error.external_compute_started = false;
  return error;
}

export const AVANTIQO_INTELLIGENCE_MODAL_OVERFLOW_PROPOSAL_CONTRACT = CONTRACT;
