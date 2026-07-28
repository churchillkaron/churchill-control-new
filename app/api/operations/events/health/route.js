export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { resolveOperationsRequestContext } from "@/lib/operations/api/resolveOperationsRequestContext";
import { serverOperationsEvents } from "@/lib/operations/events/serverOperationsEvents";
import { OPERATIONS_ACTIONS } from "@/lib/operations/security/OperationsAuthorizationPolicy";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const input = Object.fromEntries(searchParams.entries());
  const resolved = await resolveOperationsRequestContext({
    request,
    input,
    capabilityId: "operational-events",
    action: OPERATIONS_ACTIONS.AUDIT,
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

  try {
    const result = await serverOperationsEvents.getOutboxHealth({
      context: resolved.context,
      deadLetterLimit: searchParams.get("dead_letter_limit") || 50,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Operations event health load failed." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const resolved = await resolveOperationsRequestContext({
    request,
    input: body,
    capabilityId: "operational-events",
    action: OPERATIONS_ACTIONS.EVENTS_MANAGE,
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

  if (!body.outbox_id) {
    return NextResponse.json(
      { ok: false, error: "outbox_id required" },
      { status: 400 },
    );
  }

  try {
    const retry = await serverOperationsEvents.retryDeadLetter({
      context: resolved.context,
      outboxId: body.outbox_id,
    });
    const delivery = await serverOperationsEvents.publishPending({
      organizationId: resolved.context.organization_id,
      limit: body.limit || 100,
    });

    return NextResponse.json({ ok: true, retry, delivery }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Operations dead-letter retry failed." },
      { status: 500 },
    );
  }
}
