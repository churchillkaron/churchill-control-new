export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { listFinanceRoles } from "@/lib/finance/security/repositories/FinancePermissionRepository";

const DOCUMENT_TYPES = new Set([
  "JOURNAL_ENTRY",
  "VENDOR_BILL",
  "VENDOR_PAYMENT",
  "CUSTOMER_CREDIT_NOTE",
  "CUSTOMER_REFUND",
  "BANK_PAYMENT",
  "PURCHASE_ORDER",
  "EXPENSE_CLAIM",
  "WRITE_OFF",
  "PERIOD_CLOSE",
  "YEAR_END_CLOSE",
]);

function text(value) {
  return String(value || "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function date(value) {
  const resolved = text(value).slice(0, 10);
  if (!resolved || Number.isNaN(new Date(`${resolved}T00:00:00.000Z`).getTime())) {
    throw new Error("A valid effective date is required");
  }
  return resolved;
}

function statusFor(message) {
  return /required|valid|supported|not found|overlap|greater|role|currency|date|scope|active/i.test(
    String(message || "")
  )
    ? 400
    : 500;
}

async function resolveAccess(request, organizationId) {
  const access = await requireOrganizationAccess({
    organizationId,
    request,
    requiredPermission: "finance.config.manage",
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      ),
    };
  }

  return { access };
}

async function validateEntity(organizationId, entityId) {
  if (!entityId) return null;

  const entity = await resolveEntity({ organizationId, entityId });
  if (!entity) throw new Error("Legal Entity not found in this organisation");
  return entity.id;
}

async function validateApproverRole(organizationId, roleCode) {
  const roles = await listFinanceRoles(organizationId);
  const normalized = upper(roleCode);
  const role = roles.find((item) => upper(item.role_code) === normalized);

  if (!role) {
    throw new Error("Approver Finance Role is not valid for this organisation");
  }

  return normalized;
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  const leftTo = leftEnd || "9999-12-31";
  const rightTo = rightEnd || "9999-12-31";
  return leftStart <= rightTo && rightStart <= leftTo;
}

async function validateNoOverlap({
  organizationId,
  recordId = null,
  entityId,
  documentType,
  currencyCode,
  thresholdAmount,
  effectiveFrom,
  effectiveTo,
}) {
  let query = supabaseAdmin
    .from("finance_approval_workflows")
    .select("id, entity_id, document_type, currency_code, threshold_amount, effective_from, effective_to, status")
    .eq("organization_id", organizationId)
    .eq("document_type", documentType)
    .eq("currency_code", currencyCode)
    .eq("threshold_amount", thresholdAmount)
    .eq("status", "ACTIVE");

  if (entityId) {
    query = query.eq("entity_id", entityId);
  } else {
    query = query.is("entity_id", null);
  }

  if (recordId) query = query.neq("id", recordId);

  const { data, error } = await query;
  if (error) throw error;

  const conflicting = (data || []).find((row) =>
    rangesOverlap(
      effectiveFrom,
      effectiveTo,
      String(row.effective_from || "").slice(0, 10),
      row.effective_to ? String(row.effective_to).slice(0, 10) : null
    )
  );

  if (conflicting) {
    throw new Error(
      "An active approval rule already overlaps this document type, scope, threshold, currency and effective period"
    );
  }
}

async function buildRecord({ organizationId, body, recordId = null }) {
  const name = text(body.name);
  const documentType = upper(body.document_type || body.documentType);
  const currencyCode = upper(body.currency_code || body.currencyCode);
  const thresholdAmount = Number(body.threshold_amount ?? body.thresholdAmount ?? 0);
  const requiredApprovals = Number(body.required_approvals ?? body.requiredApprovals ?? 1);
  const effectiveFrom = date(body.effective_from || body.effectiveFrom);
  const effectiveToRaw = text(body.effective_to || body.effectiveTo);
  const effectiveTo = effectiveToRaw ? date(effectiveToRaw) : null;
  const entityId = await validateEntity(
    organizationId,
    body.entity_id || body.entityId || null
  );
  const approverRole = await validateApproverRole(
    organizationId,
    body.approver_role || body.approverRole
  );

  if (!name) throw new Error("Workflow Name required");
  if (!DOCUMENT_TYPES.has(documentType)) {
    throw new Error("Document Type is not supported");
  }
  if (!currencyCode) throw new Error("Threshold Currency required");
  if (!Number.isFinite(thresholdAmount) || thresholdAmount < 0) {
    throw new Error("Threshold Amount must be zero or greater");
  }
  if (!Number.isInteger(requiredApprovals) || requiredApprovals < 1) {
    throw new Error("Required Approvals must be a whole number greater than zero");
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error("Effective To cannot be before Effective From");
  }

  await validateNoOverlap({
    organizationId,
    recordId,
    entityId,
    documentType,
    currencyCode,
    thresholdAmount,
    effectiveFrom,
    effectiveTo,
  });

  return {
    organization_id: organizationId,
    entity_id: entityId,
    name,
    document_type: documentType,
    threshold_amount: thresholdAmount,
    currency_code: currencyCode,
    approver_role: approverRole,
    required_approvals: requiredApprovals,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    status: "ACTIVE",
    updated_at: new Date().toISOString(),
  };
}

function decorate(row) {
  const documentLabel = String(row.document_type || "Approval Rule")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return {
    ...row,
    name: row.name || documentLabel,
    title: row.name || documentLabel,
    code: documentLabel,
    scope_label: row.entity_id ? "Legal Entity" : "All Legal Entities",
    threshold_display: `${row.currency_code || ""} ${Number(row.threshold_amount || 0).toLocaleString("en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`.trim(),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId =
      searchParams.get("organizationId") || searchParams.get("organization_id");
    const { access, response } = await resolveAccess(request, organizationId);
    if (response) return response;

    const { data, error } = await supabaseAdmin
      .from("finance_approval_workflows")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("document_type", { ascending: true })
      .order("threshold_amount", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organization_id: access.organizationId,
      rows: (data || []).map(decorate),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Unable to load approval workflows", rows: [] },
      { status: statusFor(error.message) }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { access, response } = await resolveAccess(
      request,
      body.organizationId || body.organization_id
    );
    if (response) return response;

    const record = await buildRecord({
      organizationId: access.organizationId,
      body,
    });

    const { data, error } = await supabaseAdmin
      .from("finance_approval_workflows")
      .insert({
        ...record,
        created_by: access.user?.id || null,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, record: decorate(data) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Unable to create approval workflow" },
      { status: statusFor(error.message) }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { access, response } = await resolveAccess(
      request,
      body.organizationId || body.organization_id
    );
    if (response) return response;

    const id = text(body.id || body.record_id);
    if (!id) throw new Error("Approval Workflow id required");

    const record = await buildRecord({
      organizationId: access.organizationId,
      body,
      recordId: id,
    });

    const { data, error } = await supabaseAdmin
      .from("finance_approval_workflows")
      .update(record)
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, record: decorate(data) });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Unable to update approval workflow" },
      { status: statusFor(error.message) }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { access, response } = await resolveAccess(
      request,
      body.organizationId || body.organization_id
    );
    if (response) return response;

    const id = text(body.id || body.record_id);
    if (!id) throw new Error("Approval Workflow id required");

    const { data, error } = await supabaseAdmin
      .from("finance_approval_workflows")
      .update({
        status: "ARCHIVED",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      archived: true,
      record: decorate(data),
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message || "Unable to archive approval workflow" },
      { status: statusFor(error.message) }
    );
  }
}
