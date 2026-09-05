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

const ALLOWED_ACTIONS = new Set(["TAKE_OWNERSHIP", "RELEASE_OWNERSHIP", "ACKNOWLEDGE", "UPDATE_COORDINATION"]);

function clean(value) {
  return String(value ?? "").trim();
}

function required(value, field) {
  const normalized = clean(value);
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function upper(value) {
  return clean(value).toUpperCase();
}

function statusFor(message) {
  const value = String(message || "");
  if (/permission denied|authentication|membership|ownership|current Tax dependency owner/i.test(value)) return 403;
  if (/required|not found|scope|dependency|action|target|note|complete|resolve|close/i.test(value)) return 400;
  return 500;
}

async function loadReturn({ organizationId, entityId, vatReturnId }) {
  const { data, error } = await supabaseAdmin
    .from("finance_vat_returns")
    .select("id,organization_id,entity_id,status")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", vatReturnId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("VAT return not found in organization and entity scope");
  return data;
}

async function loadLiveGuidance({ organizationId, entityId, vatReturnId }) {
  const raw = await buildFinanceVatReturnPreflight({ organizationId, entityId, vatReturnId });
  const calendar = applyFinanceTaxCalendarToPreflight(raw);
  const current = applyFinanceVatCalculationMethodToPreflight(calendar);
  return deriveFinanceTaxCloseGuidance(current);
}

async function listEnvelopes({ organizationId, entityId, vatReturnId }) {
  const { data, error } = await supabaseAdmin
    .from("finance_tax_dependency_work_envelopes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("vat_return_id", vatReturnId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

function mergeTruth(envelopes, guidance) {
  const active = new Map((guidance?.dependencies || []).map(item => [upper(item.code), item]));
  return (envelopes || []).map(envelope => ({
    ...envelope,
    truth_active: active.has(upper(envelope.dependency_code)),
    truth: active.get(upper(envelope.dependency_code)) || null,
  }));
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
    await loadReturn({ organizationId: access.organizationId, entityId, vatReturnId });
    const [guidance, envelopes] = await Promise.all([
      loadLiveGuidance({ organizationId: access.organizationId, entityId, vatReturnId }),
      listEnvelopes({ organizationId: access.organizationId, entityId, vatReturnId }),
    ]);

    return NextResponse.json({
      success: true,
      return_id: vatReturnId,
      current_user_id: access.user?.id || null,
      guidance,
      envelopes: mergeTruth(envelopes, guidance),
      resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY",
    });
  } catch (error) {
    const message = error?.message || "Tax dependency work could not be loaded";
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
    if (["RESOLVE", "COMPLETE", "CLOSE", "DONE"].includes(action)) {
      throw new Error("Tax dependencies cannot be completed manually; resolution comes only from live Tax accounting truth");
    }
    if (!ALLOWED_ACTIONS.has(action)) throw new Error(`Unsupported Tax dependency work action: ${action}`);

    await loadReturn({ organizationId: access.organizationId, entityId, vatReturnId });
    const guidance = await loadLiveGuidance({ organizationId: access.organizationId, entityId, vatReturnId });
    const dependency = (guidance?.dependencies || []).find(item => upper(item.code) === dependencyCode);
    if (!dependency) throw new Error("Tax dependency is no longer active in live accounting truth; refresh before updating coordination work");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_tax_dependency_work_envelopes")
      .select("*")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("vat_return_id", vatReturnId)
      .eq("dependency_code", dependencyCode)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const ownedByAnother = Boolean(existing?.assigned_to && existing.assigned_to !== actorId);
    const now = new Date().toISOString();
    const next = {
      organization_id: access.organizationId,
      entity_id: entityId,
      vat_return_id: vatReturnId,
      dependency_code: dependencyCode,
      assigned_to: existing?.assigned_to || null,
      target_at: existing?.target_at || null,
      acknowledged_at: existing?.acknowledged_at || null,
      acknowledged_by: existing?.acknowledged_by || null,
      note: existing?.note || null,
      client_request_id: existing?.client_request_id || null,
      metadata: existing?.metadata && typeof existing.metadata === "object" ? existing.metadata : {},
      created_by: existing?.created_by || actorId,
      created_at: existing?.created_at || now,
      updated_at: now,
    };

    if (action === "TAKE_OWNERSHIP") {
      if (ownedByAnother) throw new Error("This Tax dependency already has a current owner; refresh before changing ownership");
      next.assigned_to = actorId;
    }
    if (action === "RELEASE_OWNERSHIP") {
      if (ownedByAnother) throw new Error("Only the current Tax dependency owner can release ownership");
      next.assigned_to = null;
    }
    if (action === "ACKNOWLEDGE") {
      if (ownedByAnother) throw new Error("Only the current Tax dependency owner can acknowledge assigned work");
      next.acknowledged_at = existing?.acknowledged_at || now;
      next.acknowledged_by = existing?.acknowledged_by || actorId;
    }
    if (action === "UPDATE_COORDINATION") {
      if (ownedByAnother) throw new Error("Only the current Tax dependency owner can update assigned coordination work");
      const targetAt = clean(body.targetAt || body.target_at) || null;
      if (targetAt && Number.isNaN(new Date(targetAt).getTime())) throw new Error("target_at must be a valid date or timestamp");
      const note = clean(body.note) || null;
      if (note && note.length > 4000) throw new Error("note exceeds 4000 characters");
      next.target_at = targetAt;
      next.note = note;
    }

    const write = existing
      ? supabaseAdmin.from("finance_tax_dependency_work_envelopes").update(next).eq("id", existing.id)
      : supabaseAdmin.from("finance_tax_dependency_work_envelopes").insert(next);
    const { data: saved, error: saveError } = await write.select("*").single();
    if (saveError) throw new Error(saveError.message);

    return NextResponse.json({
      success: true,
      current_user_id: actorId,
      envelope: { ...saved, truth_active: true, truth: dependency },
      resolution_authority: "LIVE_TAX_PREFLIGHT_ONLY",
    });
  } catch (error) {
    const message = error?.message || "Tax dependency work could not be updated";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
