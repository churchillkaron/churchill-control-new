import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function approvalId(input = {}) {
  return text(
    input.modal_compute_approval_id ||
    input.modalComputeApprovalId ||
    input.context?.modal_compute_approval_id ||
    input.context?.modalComputeApprovalId ||
    input.metadata?.modal_compute_approval_id ||
    input.metadata?.modalComputeApprovalId ||
    input.provider_parameters?.modal_compute_approval_id ||
    input.provider_parameters?.modalComputeApprovalId,
    120,
  );
}

function requestedSupplierCost(input = {}) {
  return Math.max(
    0,
    finite(
      input.context?.modal_requested_supplier_cost_thb ??
      input.context?.modalRequestedSupplierCostThb ??
      input.modal_requested_supplier_cost_thb ??
      input.modalRequestedSupplierCostThb ??
      input.metadata?.modal_requested_supplier_cost_thb ??
      input.provider_parameters?.modal_requested_supplier_cost_thb,
      0,
    ),
  );
}

export async function consumeModalComputeApproval({
  input = {},
  capability = null,
  infrastructureProvider = null,
} = {}) {
  const organizationId = text(input.context?.organization_id, 120);
  const resolvedCapability = text(capability || input.capability, 200);
  const resolvedApprovalId = approvalId(input);

  if (!organizationId) throw new Error("MODAL_COMPUTE_GOVERNED_ORGANIZATION_REQUIRED");
  if (!resolvedCapability) throw new Error("MODAL_COMPUTE_CAPABILITY_REQUIRED");
  if (!resolvedApprovalId) throw new Error("MODAL_COMPUTE_OWNER_APPROVAL_REQUIRED");

  const { data: approval, error: lookupError } = await supabaseAdmin
    .from("modal_compute_approvals")
    .select("id,organization_id,provider,capability,infrastructure_provider,status,maximum_calls,used_calls,maximum_supplier_cost_thb,used_supplier_cost_thb,expires_at,reason,metadata")
    .eq("id", resolvedApprovalId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (!approval) throw new Error("MODAL_COMPUTE_APPROVAL_NOT_FOUND");
  if (text(approval.provider).toLowerCase() !== "modal") throw new Error("MODAL_COMPUTE_APPROVAL_PROVIDER_INVALID");
  if (
    approval.infrastructure_provider &&
    infrastructureProvider &&
    text(approval.infrastructure_provider).toUpperCase() !== text(infrastructureProvider).toUpperCase()
  ) {
    throw new Error("MODAL_COMPUTE_APPROVAL_INFRASTRUCTURE_MISMATCH");
  }

  const { data, error } = await supabaseAdmin.rpc("consume_modal_compute_approval", {
    p_organization_id: organizationId,
    p_approval_id: resolvedApprovalId,
    p_capability: resolvedCapability,
    p_requested_supplier_cost_thb: requestedSupplierCost(input),
  });
  if (error) throw error;

  return {
    approval_id: resolvedApprovalId,
    organization_id: organizationId,
    capability: resolvedCapability,
    infrastructure_provider: infrastructureProvider || approval.infrastructure_provider || null,
    reason: approval.reason,
    ...((data && typeof data === "object") ? data : {}),
  };
}

export function modalComputeApprovalId(input = {}) {
  return approvalId(input) || null;
}

export const ModalComputeApprovalRuntime = {
  consume: consumeModalComputeApproval,
  approvalId: modalComputeApprovalId,
};
