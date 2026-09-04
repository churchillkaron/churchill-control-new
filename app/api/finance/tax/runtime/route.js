export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  buildFinanceVatReturnPreflight,
  loadFinanceTaxWorkspaceSetup,
} from "@/lib/finance/tax/FinanceVatReturnPreflight";

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function statusFor(message) {
  const normalized = String(message || "");
  if (/permission denied|authentication|membership/i.test(normalized)) return 403;
  if (/required|not found|scope|period|jurisdiction|duplicate|submitted|preflight|registration|rule|rate/i.test(normalized)) return 400;
  return 500;
}

async function listReturns({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin
    .from("finance_vat_returns")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("period_end", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrganizationAccess({
      organizationId:
        searchParams.get("organizationId") ||
        searchParams.get("organization_id"),
      request,
    });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "vat_returns",
      operation: "read",
      access,
    });

    const entityId = required(
      searchParams.get("entityId") || searchParams.get("entity_id"),
      "entity_id"
    );
    const vatReturnId = searchParams.get("vatReturnId") || searchParams.get("vat_return_id");

    const [setup, returns] = await Promise.all([
      loadFinanceTaxWorkspaceSetup({ organizationId: access.organizationId, entityId }),
      listReturns({ organizationId: access.organizationId, entityId }),
    ]);

    const selectedId = vatReturnId || returns[0]?.id || null;
    const preflight = selectedId
      ? await buildFinanceVatReturnPreflight({
          organizationId: access.organizationId,
          entityId,
          vatReturnId: selectedId,
        })
      : null;

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      entityId,
      setup,
      returns,
      selected_return_id: selectedId,
      preflight,
    });
  } catch (error) {
    const message = error?.message || "Tax workspace could not be loaded";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const access = await requireOrganizationAccess({
      organizationId: body.organizationId || body.organization_id,
      request,
    });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }

    await requireFinanceWorkspacePermission({
      capabilityId: "vat_returns",
      operation: "write",
      access,
    });

    const entityId = required(body.entityId || body.entity_id, "entity_id");
    const periodStart = required(body.periodStart || body.period_start, "period_start");
    const periodEnd = required(body.periodEnd || body.period_end, "period_end");
    const jurisdiction = required(
      body.jurisdictionCode || body.jurisdiction_code,
      "jurisdiction_code"
    ).toUpperCase();
    const actorId = required(access.user?.id, "authenticated user");

    if (periodEnd < periodStart) throw new Error("period_end cannot be before period_start");

    const setup = await loadFinanceTaxWorkspaceSetup({
      organizationId: access.organizationId,
      entityId,
    });
    if (!setup.vat_regimes.includes(jurisdiction)) {
      throw new Error(`No active VAT rules are configured for ${jurisdiction}`);
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_vat_returns")
      .select("id, status")
      .eq("organization_id", access.organizationId)
      .eq("entity_id", entityId)
      .eq("jurisdiction_code", jurisdiction)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) throw new Error("A VAT return already exists for this jurisdiction and period");

    const record = {
      organization_id: access.organizationId,
      entity_id: entityId,
      period_id: body.periodId || body.period_id || null,
      period_start: periodStart,
      period_end: periodEnd,
      filing_due_date: body.filingDueDate || body.filing_due_date || null,
      registration_reference: String(
        body.registrationReference
          || body.registration_reference
          || setup.registration_reference
          || ""
      ).trim() || null,
      jurisdiction_code: jurisdiction,
      notes: String(body.notes || "").trim() || null,
      created_by: actorId,
      status: "DRAFT",
    };

    const { data, error } = await supabaseAdmin
      .from("finance_vat_returns")
      .insert(record)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, return: data }, { status: 201 });
  } catch (error) {
    const message = error?.message || "VAT filing obligation could not be created";
    return NextResponse.json({ success: false, error: message }, { status: statusFor(message) });
  }
}
