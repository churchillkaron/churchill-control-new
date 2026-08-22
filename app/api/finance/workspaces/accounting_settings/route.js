export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { requireFinanceWorkspacePermission } from "@/lib/finance/workspaces/FinanceWorkspacePermissionPolicy";
import {
  normalizeAccountingPolicyPayload,
  validateAccountingPolicyPayload,
} from "@/lib/finance/accounting-settings/AccountingPolicyWritePolicy";

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

function responseError(error, fallback) {
  const message = error?.message || fallback;
  const status = /permission denied/i.test(message)
    ? 403
    : /required|not found|not supported|not valid|cannot be/i.test(message)
      ? 400
      : 500;
  return NextResponse.json({ success: false, error: message }, { status });
}

function present(row) {
  if (!row) return row;
  return {
    ...row,
    policy_value: row.value_json?.value || null,
    title: row.name || row.setting_key,
    code: row.setting_key,
  };
}

async function accessFor(request, organizationId, operation) {
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) return { access, response: NextResponse.json(
    { success: false, error: access.error },
    { status: access.status }
  ) };

  await requireFinanceWorkspacePermission({
    capabilityId: "accounting_settings",
    operation,
    access,
  });
  return { access, response: null };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const { access, response } = await accessFor(
      request,
      queryValue(searchParams, "organizationId", "organization_id"),
      "read"
    );
    if (response) return response;

    const { data, error } = await supabaseAdmin
      .from("finance_accounting_settings")
      .select("id, organization_id, setting_key, name, value_json, effective_from, effective_to, status, created_at, updated_at")
      .eq("organization_id", access.organizationId)
      .not("setting_key", "is", null)
      .order("setting_key", { ascending: true })
      .order("effective_from", { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      rows: (data || []).map(present),
    });
  } catch (error) {
    return responseError(error, "Finance accounting policies load failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { access, response } = await accessFor(
      request,
      body.organizationId || body.organization_id,
      "write"
    );
    if (response) return response;

    const payload = validateAccountingPolicyPayload(
      normalizeAccountingPolicyPayload(body)
    );

    const { data, error } = await supabaseAdmin
      .from("finance_accounting_settings")
      .insert({
        organization_id: access.organizationId,
        setting_key: payload.setting_key,
        value_json: payload.value_json,
        effective_from: payload.effective_from,
        effective_to: payload.effective_to,
        status: payload.status,
        created_by: access.user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, record: present(data) });
  } catch (error) {
    return responseError(error, "Finance accounting policy save failed");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { access, response } = await accessFor(
      request,
      body.organizationId || body.organization_id,
      "write"
    );
    if (response) return response;

    const id = body.id || body.record_id;
    if (!id) throw new Error("id required");

    const { data: existing, error: existingError } = await supabaseAdmin
      .from("finance_accounting_settings")
      .select("id, setting_key, value_json, effective_from, effective_to, status")
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .not("setting_key", "is", null)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw new Error("Accounting Policy not found");

    const payload = validateAccountingPolicyPayload(
      normalizeAccountingPolicyPayload({ ...existing, ...body })
    );

    const { data, error } = await supabaseAdmin
      .from("finance_accounting_settings")
      .update({
        setting_key: payload.setting_key,
        value_json: payload.value_json,
        effective_from: payload.effective_from,
        effective_to: payload.effective_to,
        status: payload.status,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, record: present(data) });
  } catch (error) {
    return responseError(error, "Finance accounting policy update failed");
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { access, response } = await accessFor(
      request,
      body.organizationId || body.organization_id,
      "write"
    );
    if (response) return response;

    const id = body.id || body.record_id;
    if (!id) throw new Error("id required");

    const { data, error } = await supabaseAdmin
      .from("finance_accounting_settings")
      .update({ status: "ARCHIVED", updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .not("setting_key", "is", null)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, archived: true, record: present(data) });
  } catch (error) {
    return responseError(error, "Finance accounting policy archive failed");
  }
}
