export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { serverOperationsEvents } from "@/lib/operations/events/serverOperationsEvents";
import {
  resolveOperationsRequestContext,
} from "@/lib/operations/api/resolveOperationsRequestContext";

const SERVICE_EXECUTION_COMMANDS = new Set(["start", "complete"]);
const SERVICE_WORK_SOURCES = new Set([
  "service-plan-occurrence",
  "service-follow-up-work-request",
]);

function text(value) {
  return String(value ?? "").trim();
}

function isServiceManagedWorkOrder(record = {}) {
  const sourceDomain = text(record.source_domain);
  const sourceType = text(record.source_type);
  const attributes = record.attributes || {};
  return (
    (sourceDomain === "service-management" && SERVICE_WORK_SOURCES.has(sourceType))
    || Boolean(attributes.service_delivery?.service_plan_id)
    || Boolean(attributes.service_follow_up?.occurrence_id)
  );
}

async function guardServiceExecutionCommand({ capabilityId, command, body, context }) {
  if (capabilityId !== "work-orders" || !SERVICE_EXECUTION_COMMANDS.has(command)) return null;
  const recordId = text(body.id || body.record_id || body.recordId);
  if (!recordId) return null;

  const detail = await serverOperationsApi.detail({
    capabilityId: "work-orders",
    id: recordId,
    context,
  });
  if (detail.status >= 400 || !detail.body?.ok || !detail.body?.record) return null;
  if (!isServiceManagedWorkOrder(detail.body.record)) return null;

  return NextResponse.json(
    {
      ok: false,
      code: "SERVICE_VISIT_REQUIRES_TECHNICIAN_WORKFLOW",
      error: command === "start"
        ? "Start this service visit from the technician workspace so arrival is bound to the exact occurrence."
        : "Complete this service visit from the technician workspace so protocol, treatment, monitoring, evidence and exception gates are validated.",
      technician_required: true,
      occurrence_id:
        detail.body.record.attributes?.service_delivery?.occurrence_id
        || detail.body.record.attributes?.service_follow_up?.corrective_occurrence_id
        || detail.body.record.source_id
        || null,
      work_order_id: detail.body.record.id,
    },
    { status: 409 },
  );
}

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const command = String(resolvedParams?.command || "").trim();
  const body = await request.json();
  const resolved = await resolveOperationsRequestContext({
    request,
    input: body,
    capabilityId,
    command,
  });

  if (!resolved.success) {
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        required_permissions: resolved.required_permissions || [],
      },
      { status: resolved.status || 400 },
    );
  }

  const serviceGuard = await guardServiceExecutionCommand({
    capabilityId,
    command,
    body,
    context: resolved.context,
  });
  if (serviceGuard) return serviceGuard;

  const result = await serverOperationsApi.execute({
    capabilityId,
    command,
    context: resolved.context,
    payload: {
      ...body,
      updated_by: resolved.user?.id || null,
      actor_id: resolved.user?.id || null,
    },
  });

  let eventDelivery = null;

  if (result.status >= 200 && result.status < 300 && result.body?.ok) {
    try {
      eventDelivery = await serverOperationsEvents.publishPending({
        organizationId: resolved.context.organization_id,
        limit: 50,
      });
    } catch (error) {
      eventDelivery = {
        ok: false,
        deferred: true,
        error: error.message || "Operations event delivery deferred.",
      };
    }
  }

  return NextResponse.json(
    {
      ...result.body,
      event_delivery: eventDelivery,
    },
    { status: result.status },
  );
}