export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { buildFinanceVatReturnPreflight } from "@/lib/finance/tax/FinanceVatReturnPreflight";
import { applyFinanceTaxCalendarToPreflight } from "@/lib/finance/tax/FinanceTaxCalendarPolicy";
import { applyFinanceVatCalculationMethodToPreflight } from "@/lib/finance/tax/FinanceVatCalculationMethodPolicy";
import { deriveFinanceTaxCloseGuidance } from "@/lib/finance/tax/FinanceTaxCloseGuidancePolicy";

function clean(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function required(value, field) {
  const normalized = clean(value);
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const value = String(message || "");
  if (/permission denied|authentication|membership/i.test(value)) return 403;
  if (/required|not found|scope|dependency|client request|client evidence|action/i.test(value)) return 400;
  return 500;
}

async function liveClientDependency({ organizationId, entityId, vatReturnId, dependencyCode }) {
  const raw = await buildFinanceVatReturnPreflight({ organizationId, entityId, vatReturnId });
  const calendar = applyFinanceTaxCalendarToPreflight(raw);
  const current = applyFinanceVatCalculationMethodToPreflight(calendar);
  const guidance = deriveFinanceTaxCloseGuidance(current);
  const dependency = (guidance?.dependencies || []).find(item => upper(item.code) === upper(dependencyCode));
  if (!dependency) throw new Error("Tax dependency is no longer active in live accounting truth; refresh before linking client evidence");
  if (dependency.client_request_recommended !== true || dependency.responsibility !== "CLIENT_EVIDENCE_ACCOUNTANT_VALIDATION") {
    throw new Error("This Tax dependency is not classified as a client evidence request");
  }
  return { guidance, dependency };
}

async function listAuthenticRequests({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin
    .from("accounting_client_requests")
    .select("id,accounting_firm_id,organization_id,entity_id,run_id,work_item_id,title,instructions,status,due_at,sent_at,submitted_at,accepted_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data || [];
}

async function loadEnvelope({ organizationId, entityId, vatReturnId, dependencyCode }) {
  const { data, error } = await supabaseAdmin
    .from("finance_tax_dependency_work_envelopes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("vat_return_id", vatReturnId)
    .eq("dependency_code", upper(dependencyCode))
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function loadRequest({ organizationId, entityId, clientRequestId }) {
  const { data, error } = await supabaseAdmin
    .from("accounting_client_requests")
    .select("id,accounting_firm_id,organization_id,entity_id,run_id,work_item_id,title,instructions,status,due_at,sent_at,submitted_at,accepted_at,updated_at")
    .eq("id", clientRequestId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Client request not found in the same organization and legal entity scope");
  if (!data.run_id || !data.work_item_id || !data.accounting_firm_id) throw new Error("Client request is not backed by a complete governed engagement context");
  return data;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId: searchParams.get("organizationId") || searchParams.get("organization_id"),
      request,
    });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "read", access });

    const entityId = required(searchParams.get("entityId") || searchParams.get("entity_id"), "entity_id");
    const vatReturnId = required(searchParams.get("vatReturnId") || searchParams.get("vat_return_id"), "vat_return_id");
    const dependencyCode = upper(required(searchParams.get("dependencyCode") || searchParams.get("dependency_code"), "dependency_code"));
    const { dependency } = await liveClientDependency({ organizationId: access.organizationId, entityId, vatReturnId, dependencyCode });
    const [requests, envelope] = await Promise.all([
      listAuthenticRequests({ organizationId: access.organizationId, entityId }),
      loadEnvelope({ organizationId: access.organizationId, entityId, vatReturnId, dependencyCode }),
    ]);
    const linked = envelope?.client_request_id
      ? requests.find(row => row.id === envelope.client_request_id) || await loadRequest({ organizationId: access.organizationId, entityId, clientRequestId: envelope.client_request_id })
      : null;

    return NextResponse.json({
      success: true,
      return_id: vatReturnId,
      dependency,
      linked_request: linked,
      candidate_requests: requests,
      request_creation_supported_here: false,
      auto_send_supported_here: false,
      resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY",
    });
  } catch (error) {
    const message = error?.message || "Tax client request bridge could not be loaded";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({ organizationId: body.organizationId || body.organization_id, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    await requireFinanceWorkspacePermission({ capabilityId: "vat_returns", operation: "write", access });

    const actorId = required(access.user?.id, "authenticated user");
    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const vatReturnId = required(body.vatReturnId || body.vat_return_id, "vat_return_id");
    const dependencyCode = upper(required(body.dependencyCode || body.dependency_code, "dependency_code"));
    const action = upper(required(body.action, "action"));
    if (!["LINK", "UNLINK"].includes(action)) throw new Error(`Unsupported Tax client request action: ${action}`);

    const { dependency } = await liveClientDependency({ organizationId: access.organizationId, entityId, vatReturnId, dependencyCode });
    const existing = await loadEnvelope({ organizationId: access.organizationId, entityId, vatReturnId, dependencyCode });
    let linkedRequest = null;
    let clientRequestId = null;
    if (action === "LINK") {
      clientRequestId = required(body.clientRequestId || body.client_request_id, "client_request_id");
      linkedRequest = await loadRequest({ organizationId: access.organizationId, entityId, clientRequestId });
    }

    const now = new Date().toISOString();
    const record = {
      organization_id: access.organizationId,
      entity_id: entityId,
      vat_return_id: vatReturnId,
      dependency_code: dependencyCode,
      assigned_to: existing?.assigned_to || null,
      target_at: existing?.target_at || null,
      acknowledged_at: existing?.acknowledged_at || null,
      acknowledged_by: existing?.acknowledged_by || null,
      note: existing?.note || null,
      client_request_id: clientRequestId,
      metadata: {
        ...(existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
        client_request_link: action === "LINK" ? {
          linked_at: now,
          linked_by: actorId,
          run_id: linkedRequest.run_id,
          work_item_id: linkedRequest.work_item_id,
          accounting_firm_id: linkedRequest.accounting_firm_id,
        } : null,
      },
      created_by: existing?.created_by || actorId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    const write = existing
      ? supabaseAdmin.from("finance_tax_dependency_work_envelopes").update(record).eq("id", existing.id)
      : supabaseAdmin.from("finance_tax_dependency_work_envelopes").insert(record);
    const { data: saved, error: saveError } = await write.select("*").single();
    if (saveError) throw new Error(saveError.message);

    return NextResponse.json({
      success: true,
      envelope: saved,
      dependency,
      linked_request: linkedRequest,
      request_creation_supported_here: false,
      auto_send_supported_here: false,
      resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY",
    });
  } catch (error) {
    const message = error?.message || "Tax client request bridge could not be updated";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
