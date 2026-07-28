export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import { serverOperationsEvents } from "@/lib/operations/events/serverOperationsEvents";
import {
  resolveOperationsRequestContext,
} from "@/lib/operations/api/resolveOperationsRequestContext";

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
