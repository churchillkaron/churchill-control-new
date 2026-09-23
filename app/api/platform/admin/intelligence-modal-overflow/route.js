export const runtime = "nodejs";

import { requirePlatformAdminAccess } from "@/lib/platform/security/requirePlatformAdminAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  approveIntelligenceModalOverflowProposal,
  rejectIntelligenceModalOverflowProposal,
} from "@/lib/platform/service-runtime/governance/IntelligenceModalOverflowProposalRuntime";

function text(value, limit = 1000) {
  return String(value ?? "").trim().slice(0, limit);
}

async function accessOrResponse() {
  const access = await requirePlatformAdminAccess();
  if (access.success) return { access, response: null };
  return {
    access: null,
    response: Response.json(
      { success: false, error: access.error || "Platform administrator access required" },
      { status: access.status || 403 },
    ),
  };
}

export async function GET(request) {
  const gate = await accessOrResponse();
  if (gate.response) return gate.response;
  const url = new URL(request.url);
  const organizationId = text(url.searchParams.get("organization_id") || url.searchParams.get("organizationId"), 120);
  if (!organizationId) {
    return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
  }

  const [proposalResult, approvalResult] = await Promise.all([
    supabaseAdmin
      .from("intelligence_modal_overflow_proposals")
      .select("id,organization_id,usage_id,capability,execution_lane,reason_code,explanation,proposed_supplier_cost_thb,cost_policy,status,approval_id,expires_at,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("modal_compute_approvals")
      .select("id,organization_id,provider,capability,infrastructure_provider,reason,status,maximum_calls,used_calls,maximum_supplier_cost_thb,used_supplier_cost_thb,approved_by,approved_at,expires_at,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("provider", "modal")
      .eq("metadata->>purpose", "INTELLIGENCE_MODAL_OVERFLOW")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (proposalResult.error) {
    return Response.json({ success: false, error: proposalResult.error.message }, { status: 500 });
  }
  if (approvalResult.error) {
    return Response.json({ success: false, error: approvalResult.error.message }, { status: 500 });
  }
  return Response.json({
    success: true,
    organization_id: organizationId,
    proposals: proposalResult.data || [],
    approvals: approvalResult.data || [],
    automatic_modal_fallback_allowed: false,
  });
}

export async function POST(request) {
  const gate = await accessOrResponse();
  if (gate.response) return gate.response;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Valid JSON body required" }, { status: 400 });
  }

  const organizationId = text(body?.organization_id || body?.organizationId, 120);
  const proposalId = text(body?.proposal_id || body?.proposalId, 120);
  if (!organizationId) return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
  if (!proposalId) return Response.json({ success: false, error: "proposal_id required" }, { status: 400 });

  try {
    const approval = await approveIntelligenceModalOverflowProposal({
      organizationId,
      proposalId,
      approvedBy: gate.access.user?.id || null,
      role: gate.access.role,
    });
    return Response.json({
      success: true,
      proposal_id: proposalId,
      approval,
      execution_binding: {
        modal_overflow_proposal_id: proposalId,
        modal_compute_approval_id: approval.approval_id,
        execution_lane: approval.execution_lane,
        intelligence_modal_overflow_reason_code: approval.reason_code,
        modal_requested_supplier_cost_thb: Number(approval.maximum_supplier_cost_thb),
      },
      automatic_modal_fallback_allowed: false,
      local_first_required: true,
    }, { status: 201 });
  } catch (error) {
    return Response.json({ success: false, error: text(error?.message || error, 500) }, { status: 400 });
  }
}

export async function DELETE(request) {
  const gate = await accessOrResponse();
  if (gate.response) return gate.response;
  const url = new URL(request.url);
  const organizationId = text(url.searchParams.get("organization_id") || url.searchParams.get("organizationId"), 120);
  const proposalId = text(url.searchParams.get("proposal_id") || url.searchParams.get("proposalId"), 120);
  const approvalId = text(url.searchParams.get("approval_id") || url.searchParams.get("approvalId"), 120);
  if (!organizationId) {
    return Response.json({ success: false, error: "organization_id required" }, { status: 400 });
  }

  if (proposalId) {
    const proposal = await rejectIntelligenceModalOverflowProposal({ organizationId, proposalId });
    if (!proposal) {
      return Response.json({ success: false, error: "Pending overflow proposal not found" }, { status: 404 });
    }
    return Response.json({ success: true, proposal });
  }

  if (!approvalId) {
    return Response.json({ success: false, error: "proposal_id or approval_id required" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("modal_compute_approvals")
    .update({ status: "REVOKED", updated_at: new Date().toISOString() })
    .eq("id", approvalId)
    .eq("organization_id", organizationId)
    .eq("provider", "modal")
    .eq("metadata->>purpose", "INTELLIGENCE_MODAL_OVERFLOW")
    .select("id,organization_id,status,updated_at")
    .maybeSingle();
  if (error) return Response.json({ success: false, error: error.message }, { status: 500 });
  if (!data) return Response.json({ success: false, error: "Overflow approval not found" }, { status: 404 });
  return Response.json({ success: true, approval: data });
}
