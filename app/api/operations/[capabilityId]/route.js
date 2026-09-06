export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  resolveOperationsRequestContext,
  searchParamsToObject,
} from "@/lib/operations/api/resolveOperationsRequestContext";
import { OPERATIONS_ACTIONS } from "@/lib/operations/security/OperationsAuthorizationPolicy";

const SERVICE_EXECUTION_COMMANDS = new Set(["start", "complete"]);
const SERVICE_WORK_SOURCES = new Set(["service-plan-occurrence", "service-follow-up-work-request"]);

function text(value) { return String(value ?? "").trim(); }
function serviceManagedWorkOrder(record = {}) {
  const attributes = record.attributes || {};
  return (
    (text(record.source_domain) === "service-management" && SERVICE_WORK_SOURCES.has(text(record.source_type)))
    || Boolean(attributes.service_delivery?.service_plan_id)
    || Boolean(attributes.service_follow_up?.occurrence_id)
  );
}
function projectWorkOrder(record = {}) {
  if (!serviceManagedWorkOrder(record)) return record;
  const commands = Array.isArray(record.allowed_commands) ? record.allowed_commands : [];
  return {
    ...record,
    allowed_commands: commands.filter((command) => !SERVICE_EXECUTION_COMMANDS.has(command)),
    technician_execution_required: true,
  };
}
function projectedResult(result, capabilityId) {
  if (capabilityId !== "work-orders" || !result?.body?.ok) return result;
  const body = result.body || {};
  if (body.record) return { ...result, body: { ...body, record: projectWorkOrder(body.record) } };
  if (Array.isArray(body.rows)) return { ...result, body: { ...body, rows: body.rows.map(projectWorkOrder) } };
  return result;
}
function respond(result) {
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const { searchParams } = new URL(request.url);
  const input = searchParamsToObject(searchParams);
  const resolved = await resolveOperationsRequestContext({ request, input, capabilityId, action: OPERATIONS_ACTIONS.VIEW });

  if (!resolved.success) {
    return NextResponse.json({ ok: false, error: resolved.error, rows: [], required_permissions: resolved.required_permissions || [] }, { status: resolved.status || 400 });
  }

  const { organizationId, organization_id, entityId, entity_id, periodId, period_id, id, record_id, ...filters } = input;

  if (id || record_id) {
    const result = await serverOperationsApi.detail({ capabilityId, id: id || record_id, context: resolved.context });
    return respond(projectedResult(result, capabilityId));
  }

  const result = await serverOperationsApi.list({ capabilityId, context: resolved.context, filters });
  return respond(projectedResult(result, capabilityId));
}

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const body = await request.json();
  const command = String(body.command || "create").trim();
  const resolved = await resolveOperationsRequestContext({ request, input: body, capabilityId, command });

  if (!resolved.success) {
    return NextResponse.json({ ok: false, error: resolved.error, required_permissions: resolved.required_permissions || [] }, { status: resolved.status || 400 });
  }

  return respond(await serverOperationsApi.execute({
    capabilityId,
    command,
    context: resolved.context,
    payload: { ...body, created_by: resolved.user?.id || null, updated_by: resolved.user?.id || null, actor_id: resolved.user?.id || null },
  }));
}

export async function PATCH(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const body = await request.json();
  const command = String(body.command || "update").trim();
  const resolved = await resolveOperationsRequestContext({ request, input: body, capabilityId, command });

  if (!resolved.success) {
    return NextResponse.json({ ok: false, error: resolved.error, required_permissions: resolved.required_permissions || [] }, { status: resolved.status || 400 });
  }

  return respond(await serverOperationsApi.execute({
    capabilityId,
    command,
    context: resolved.context,
    payload: { ...body, updated_by: resolved.user?.id || null, actor_id: resolved.user?.id || null },
  }));
}