export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolveEntity } from "@/lib/platform/entities/resolveEntity";
import {
  decorateNumberSequenceRows,
  normalizeNumberSequencePayload,
  validateNumberSequenceWrite,
} from "@/lib/finance/number-sequences/FinanceNumberSequencePolicy";

function value(searchParams, camel, snake) {
  return searchParams.get(camel) || searchParams.get(snake) || null;
}

function required(input, field) {
  if (input === undefined || input === null || input === "") {
    throw new Error(`${field} required`);
  }
  return input;
}

function responseError(error, fallback) {
  const message = error?.message || fallback;
  const status = /required|not found|must|supported|already exists|cannot|outside|lower|exceed/i.test(
    message
  )
    ? 400
    : 500;

  return NextResponse.json({ success: false, error: message }, { status });
}

async function accessFromRequest(request, body = null) {
  const organizationId = body
    ? body.organizationId || body.organization_id
    : value(new URL(request.url).searchParams, "organizationId", "organization_id");

  const access = await requireOrganizationAccess({ organizationId, request });
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

async function resolveLegalEntity(organizationId, entityId) {
  const resolved = await resolveEntity({ organizationId, entityId });
  if (!resolved) throw new Error("Legal Entity not found in this organisation");
  return resolved.id;
}

async function loadExisting(organizationId, id) {
  const { data, error } = await supabaseAdmin
    .from("finance_number_sequences")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Number Sequence not found");
  return data;
}

function runtimeAliases(documentType) {
  const normalized = String(documentType || "").trim().toUpperCase();
  return normalized === "CUSTOMER_INVOICE"
    ? ["CUSTOMER_INVOICE", "INVOICE"]
    : [normalized];
}

async function hasAllocatedNumbers(organizationId, sequence) {
  const { data, error } = await supabaseAdmin
    .from("document_number_sequences")
    .select("id, document_type")
    .eq("organization_id", organizationId)
    .eq("entity_id", sequence.entity_id)
    .limit(250);

  if (error) throw error;
  const aliases = runtimeAliases(sequence.document_type);
  return (data || []).some((row) =>
    aliases.includes(String(row.document_type || "").trim().toUpperCase())
  );
}

export async function GET(request) {
  try {
    const context = await accessFromRequest(request);
    if (context.response) return context.response;

    const { access } = context;
    const searchParams = new URL(request.url).searchParams;
    const requestedEntityId = value(searchParams, "entityId", "entity_id");

    let query = supabaseAdmin
      .from("finance_number_sequences")
      .select("*")
      .eq("organization_id", access.organizationId)
      .order("document_type", { ascending: true })
      .limit(250);

    if (requestedEntityId) {
      const entityId = await resolveLegalEntity(
        access.organizationId,
        requestedEntityId
      );
      query = query.eq("entity_id", entityId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      capabilityId: "number_sequences",
      organization_id: access.organizationId,
      scope: "organization",
      sourceTable: "finance_number_sequences",
      rows: decorateNumberSequenceRows(data || []),
      unavailable: false,
    });
  } catch (error) {
    return responseError(error, "Number Sequences load failed");
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const context = await accessFromRequest(request, body);
    if (context.response) return context.response;

    const { access } = context;
    const payload = normalizeNumberSequencePayload({
      entity_id: body.entity_id || body.entityId,
      document_type: body.document_type,
      prefix: body.prefix,
      suffix: body.suffix,
      next_number: body.next_number,
      padding: body.padding,
      reset_policy: body.reset_policy,
    });

    payload.entity_id = await resolveLegalEntity(
      access.organizationId,
      required(payload.entity_id, "entity_id")
    );

    await validateNumberSequenceWrite({
      organizationId: access.organizationId,
      payload,
    });

    const { data, error } = await supabaseAdmin
      .from("finance_number_sequences")
      .insert({
        ...payload,
        organization_id: access.organizationId,
        status: "ACTIVE",
        created_by: access.user?.id || null,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      capabilityId: "number_sequences",
      record: decorateNumberSequenceRows([data])[0],
    });
  } catch (error) {
    return responseError(error, "Number Sequence save failed");
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const context = await accessFromRequest(request, body);
    if (context.response) return context.response;

    const { access } = context;
    const id = required(body.id || body.record_id, "id");
    const editable = [
      "entity_id",
      "document_type",
      "prefix",
      "suffix",
      "next_number",
      "padding",
      "reset_policy",
    ];
    const payload = {};

    for (const field of editable) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        payload[field] = body[field];
      }
    }

    if (Object.keys(payload).length === 0) {
      throw new Error("No editable fields provided");
    }

    Object.assign(payload, normalizeNumberSequencePayload(payload));

    if (payload.entity_id) {
      payload.entity_id = await resolveLegalEntity(
        access.organizationId,
        payload.entity_id
      );
    }

    await validateNumberSequenceWrite({
      organizationId: access.organizationId,
      payload,
      recordId: id,
    });

    const { data, error } = await supabaseAdmin
      .from("finance_number_sequences")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      capabilityId: "number_sequences",
      record: decorateNumberSequenceRows([data])[0],
    });
  } catch (error) {
    return responseError(error, "Number Sequence update failed");
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const context = await accessFromRequest(request, body);
    if (context.response) return context.response;

    const { access } = context;
    const id = required(body.id || body.record_id, "id");
    const existing = await loadExisting(access.organizationId, id);

    if (await hasAllocatedNumbers(access.organizationId, existing)) {
      throw new Error(
        "An in-use Number Sequence cannot be archived because document numbering must remain continuous"
      );
    }

    const { data, error } = await supabaseAdmin
      .from("finance_number_sequences")
      .update({ status: "ARCHIVED", updated_at: new Date().toISOString() })
      .eq("organization_id", access.organizationId)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      capabilityId: "number_sequences",
      archived: true,
      record: decorateNumberSequenceRows([data])[0],
    });
  } catch (error) {
    return responseError(error, "Number Sequence archive failed");
  }
}
