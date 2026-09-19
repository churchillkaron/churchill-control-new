export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const OWNER_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function role(value) {
  return text(value, 120).toUpperCase();
}

async function ownerAccess(request, organizationId) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { error: Response.json({ success:false,error:access.error }, { status: access.status || 403 }) };
  if (!OWNER_ROLES.has(role(access.role))) {
    return { error: Response.json({ success:false,error:"Organization owner approval is required for Modal compute" }, { status:403 }) };
  }
  return { access };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"), 120);
    const resolved = await ownerAccess(request, organizationId);
    if (resolved.error) return resolved.error;

    const { data, error } = await supabaseAdmin
      .from("modal_compute_approvals")
      .select("id,organization_id,provider,capability,infrastructure_provider,reason,status,maximum_calls,used_calls,maximum_supplier_cost_thb,used_supplier_cost_thb,approved_by,approved_at,expires_at,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending:false })
      .limit(100);
    if (error) throw error;

    return Response.json({ success:true, approvals:data || [] });
  } catch (error) {
    return Response.json({ success:false,error:error?.message || "Unable to load Modal approvals" }, { status:error?.status || 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 120);
    const resolved = await ownerAccess(request, organizationId);
    if (resolved.error) return resolved.error;

    const capability = text(body.capability, 200);
    const reason = text(body.reason, 2000);
    const infrastructureProvider = text(body.infrastructure_provider || body.infrastructureProvider, 200) || null;
    const maximumCalls = Math.max(1, Math.min(100, Math.floor(number(body.maximum_calls ?? body.maximumCalls, 1))));
    const maximumSupplierCostThb = number(body.maximum_supplier_cost_thb ?? body.maximumSupplierCostThb, null);
    const expiresMinutes = Math.max(1, Math.min(24 * 60, Math.floor(number(body.expires_minutes ?? body.expiresMinutes, 30))));

    if (!capability) return Response.json({ success:false,error:"capability required" }, { status:400 });
    if (!reason) return Response.json({ success:false,error:"reason required" }, { status:400 });
    if (maximumSupplierCostThb !== null && maximumSupplierCostThb <= 0) {
      return Response.json({ success:false,error:"maximum_supplier_cost_thb must be greater than zero" }, { status:400 });
    }

    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("modal_compute_approvals")
      .insert({
        organization_id: organizationId,
        provider: "modal",
        capability,
        infrastructure_provider: infrastructureProvider,
        reason,
        status: "APPROVED",
        maximum_calls: maximumCalls,
        used_calls: 0,
        maximum_supplier_cost_thb: maximumSupplierCostThb,
        used_supplier_cost_thb: 0,
        approved_by: resolved.access.user?.id || resolved.access.userId || null,
        approved_at: new Date().toISOString(),
        expires_at: expiresAt,
        metadata: {
          contract: "AVANTIQO_MODAL_COMPUTE_OWNER_APPROVAL_V1",
          explicit_owner_approval: true,
          automatic_approval_forbidden: true,
          created_from: "PLATFORM_MODAL_APPROVAL_API",
        },
      })
      .select()
      .single();
    if (error) throw error;

    return Response.json({ success:true, approval:data }, { status:201 });
  } catch (error) {
    return Response.json({ success:false,error:error?.message || "Unable to create Modal approval" }, { status:error?.status || 500 });
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body.organizationId || body.organization_id, 120);
    const approvalId = text(body.approvalId || body.approval_id, 120);
    const resolved = await ownerAccess(request, organizationId);
    if (resolved.error) return resolved.error;
    if (!approvalId) return Response.json({ success:false,error:"approval_id required" }, { status:400 });

    const { data, error } = await supabaseAdmin
      .from("modal_compute_approvals")
      .update({
        status:"REVOKED",
        updated_at:new Date().toISOString(),
        metadata:{
          contract:"AVANTIQO_MODAL_COMPUTE_OWNER_APPROVAL_V1",
          revoked_by:resolved.access.user?.id || resolved.access.userId || null,
          revoked_at:new Date().toISOString(),
        },
      })
      .eq("id", approvalId)
      .eq("organization_id", organizationId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ success:false,error:"Approval not found" }, { status:404 });
    return Response.json({ success:true, approval:data });
  } catch (error) {
    return Response.json({ success:false,error:error?.message || "Unable to revoke Modal approval" }, { status:error?.status || 500 });
  }
}
