export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import { getFinanceWorkspaceContract } from "@/lib/finance/workspaces/FinanceWorkspaceContracts";

const MISSING_RELATION_CODES = new Set([
  "42P01",
  "PGRST204",
  "PGRST205",
]);

const PERIOD_SCOPED_TABLES = new Set([
  "finance_opening_balance_batches",
  "finance_fx_revaluation_runs",
  "finance_depreciation_runs",
]);

const IDEMPOTENT_TABLES = new Set([
  "finance_opening_balance_batches",
  "finance_recurring_journal_templates",
]);

const ARCHIVABLE_TABLES = new Set([
  "finance_opening_balance_batches",
  "finance_recurring_journal_templates",
  "finance_collection_cases",
  "finance_revenue_recognition_schedules",
  "finance_bank_statement_imports",
  "finance_bank_reconciliation_runs",
  "finance_fx_revaluation_runs",
  "finance_vat_returns",
  "finance_depreciation_runs",
  "finance_statutory_filings",
  "finance_report_templates",
  "finance_scheduled_reports",
  "finance_accounting_settings",
  "finance_number_sequences",
  "finance_posting_rules",
  "finance_approval_workflows",
  "finance_government_connections",
  "finance_banking_integrations",
  "finance_e_invoicing_settings",
  "finance_document_templates",
]);

function queryValue(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

function isMissingRelation(error) {
  return MISSING_RELATION_CODES.has(String(error?.code || ""));
}

function required(value, field) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${field} required`);
  }

  return value;
}

function parseJsonField(value, field) {
  if (value === undefined || value === null || value === "") {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${field} must contain valid JSON`);
  }
}

function normalizePayload(contract, body) {
  const schema = Array.isArray(contract.schema) ? contract.schema : [];
  const allowed = new Set(schema.map(field => field.name));
  const payload = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (!allowed.has(key)) {
      continue;
    }

    if (key === "definition_json" || key === "value_json") {
      payload[key] = parseJsonField(value, key);
      continue;
    }

    payload[key] = value;
  }

  return payload;
}

function validateRequiredFields(contract, payload) {
  for (const field of Array.isArray(contract.schema) ? contract.schema : []) {
    if (field.required) {
      required(payload[field.name], field.name);
    }
  }
}

async function resolveScopedEntity({
  contract,
  access,
  requestedEntityId,
}) {
  if (contract.scope !== "entity" && !requestedEntityId) {
    return null;
  }

  if (contract.scope === "entity" && !requestedEntityId) {
    throw new Error("entity_id required for this Finance workspace");
  }

  const entity = await resolveEntity({
    organizationId: access.organizationId,
    entityId: requestedEntityId,
  });

  if (!entity) {
    throw new Error("Legal entity not found in organisation");
  }

  return entity.id;
}

async function resolveWriteContext(request, params) {
  const capabilityId = String(params?.capabilityId || "").trim();
  const contract = getFinanceWorkspaceContract(capabilityId);

  if (!contract) {
    return {
      response: NextResponse.json(
        { success: false, error: "Unknown Finance workspace" },
        { status: 404 }
      ),
    };
  }

  if (contract.readOnly || !contract.schema?.length || !contract.table) {
    return {
      response: NextResponse.json(
        { success: false, error: "This Finance workspace is read-only" },
        { status: 405 }
      ),
    };
  }

  const body = await request.json();
  const access = await requireOrganizationAccess({
    organizationId: body.organizationId || body.organization_id,
    request,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      ),
    };
  }

  const requestedEntityId = body.entity_id || body.entityId || null;
  const entityId = await resolveScopedEntity({
    contract,
    access,
    requestedEntityId,
  });

  return {
    capabilityId,
    contract,
    body,
    access,
    entityId,
  };
}

function scopedMutation(query, { contract, access, entityId }) {
  let scoped = query.eq("organization_id", access.organizationId);

  if (contract.scope === "entity") {
    scoped = scoped.eq("entity_id", entityId);
  }

  return scoped;
}

async function readTable({
  table,
  contract,
  organizationId,
  entityId,
}) {
  let query = supabaseAdmin
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .limit(250);

  if (contract.scope === "entity") {
    query = query.eq("entity_id", entityId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRelation(error)) {
      return null;
    }

    throw new Error(`Unable to load ${table}: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

function failureResponse(error, fallback) {
  const message = error.message || fallback;
  const status = /required|not found|read-only|valid JSON|duplicate|unique|no editable fields|does not support archive/i.test(message)
    ? 400
    : 500;

  return NextResponse.json(
    { success: false, error: message },
    { status }
  );
}

export async function GET(request, { params }) {
  try {
    const capabilityId = String(params?.capabilityId || "").trim();
    const contract = getFinanceWorkspaceContract(capabilityId);

    if (!contract) {
      return NextResponse.json(
        { success: false, error: "Unknown Finance workspace" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedOrganizationId = queryValue(
      searchParams,
      "organizationId",
      "organization_id"
    );
    const access = await requireOrganizationAccess({
      organizationId: requestedOrganizationId,
      request,
    });

    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error, rows: [] },
        { status: access.status }
      );
    }

    const requestedEntityId = queryValue(
      searchParams,
      "entityId",
      "entity_id"
    );
    const entityId = await resolveScopedEntity({
      contract,
      access,
      requestedEntityId,
    });

    let rows = [];
    let sourceTable = null;

    for (const table of contract.tables) {
      const result = await readTable({
        table,
        contract,
        organizationId: access.organizationId,
        entityId,
      });

      if (result !== null) {
        rows = result;
        sourceTable = table;
        break;
      }
    }

    return NextResponse.json({
      success: true,
      capabilityId,
      organization_id: access.organizationId,
      entity_id: entityId,
      scope: contract.scope,
      sourceTable,
      rows,
      unavailable: sourceTable === null,
    });
  } catch (error) {
    return failureResponse(error, "Finance workspace load failed");
  }
}

export async function POST(request, { params }) {
  try {
    const context = await resolveWriteContext(request, params);
    if (context.response) return context.response;

    const {
      capabilityId,
      contract,
      body,
      access,
      entityId,
    } = context;

    const payload = normalizePayload(contract, body);
    validateRequiredFields(contract, payload);

    if (payload.entity_id) {
      payload.entity_id = await resolveScopedEntity({
        contract: { scope: "organization" },
        access,
        requestedEntityId: payload.entity_id,
      });
    }

    const record = {
      ...payload,
      organization_id: access.organizationId,
      created_by: access.user?.id || null,
      updated_at: new Date().toISOString(),
    };

    if (contract.scope === "entity") {
      record.entity_id = entityId;
    }

    if (
      PERIOD_SCOPED_TABLES.has(contract.table) &&
      (body.period_id || body.periodId)
    ) {
      record.period_id = body.period_id || body.periodId;
    }

    if (
      IDEMPOTENT_TABLES.has(contract.table) &&
      (body.idempotency_key || body.idempotencyKey)
    ) {
      record.idempotency_key = body.idempotency_key || body.idempotencyKey;
    }

    const query = contract.singleton
      ? supabaseAdmin
          .from(contract.table)
          .upsert(record, { onConflict: "organization_id" })
          .select("*")
          .single()
      : supabaseAdmin
          .from(contract.table)
          .insert(record)
          .select("*")
          .single();

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      capabilityId,
      record: data,
    });
  } catch (error) {
    return failureResponse(error, "Finance workspace save failed");
  }
}

export async function PATCH(request, { params }) {
  try {
    const context = await resolveWriteContext(request, params);
    if (context.response) return context.response;

    const {
      capabilityId,
      contract,
      body,
      access,
      entityId,
    } = context;

    const id = required(body.id || body.record_id, "id");
    const payload = normalizePayload(contract, body);

    if (payload.entity_id) {
      payload.entity_id = await resolveScopedEntity({
        contract: { scope: "organization" },
        access,
        requestedEntityId: payload.entity_id,
      });
    }

    if (Object.keys(payload).length === 0) {
      throw new Error("No editable fields provided");
    }

    let query = supabaseAdmin
      .from(contract.table)
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    query = scopedMutation(query, {
      contract,
      access,
      entityId,
    });

    const { data, error } = await query.select("*").single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      capabilityId,
      record: data,
    });
  } catch (error) {
    return failureResponse(error, "Finance workspace update failed");
  }
}

export async function DELETE(request, { params }) {
  try {
    const context = await resolveWriteContext(request, params);
    if (context.response) return context.response;

    const {
      capabilityId,
      contract,
      body,
      access,
      entityId,
    } = context;

    if (!ARCHIVABLE_TABLES.has(contract.table)) {
      throw new Error("This Finance workspace does not support archive");
    }

    const id = required(body.id || body.record_id, "id");

    let query = supabaseAdmin
      .from(contract.table)
      .update({
        status: "ARCHIVED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    query = scopedMutation(query, {
      contract,
      access,
      entityId,
    });

    const { data, error } = await query.select("*").single();

    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      capabilityId,
      archived: true,
      record: data,
    });
  } catch (error) {
    return failureResponse(error, "Finance workspace archive failed");
  }
}
