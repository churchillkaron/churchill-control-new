export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { resolveOperationsRequestContext } from "@/lib/operations/api/resolveOperationsRequestContext";
import { serverOperationsEvents } from "@/lib/operations/events/serverOperationsEvents";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const input = Object.fromEntries(searchParams.entries());
  const resolved = await resolveOperationsRequestContext({ request, input });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status || 400 },
    );
  }

  try {
    const events = await serverOperationsEvents.listEvents({
      context: resolved.context,
      capabilityId: searchParams.get("capability_id") || null,
      aggregateId: searchParams.get("aggregate_id") || null,
      actorId: searchParams.get("actor_id") || null,
      limit: searchParams.get("limit") || 200,
    });

    return NextResponse.json({
      ok: true,
      events,
      count: events.length,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Operations event load failed." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const resolved = await resolveOperationsRequestContext({ request, input: body });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status || 400 },
    );
  }

  try {
    const result = await serverOperationsEvents.publishPending({
      organizationId: resolved.context.organization_id,
      limit: body.limit || 100,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Operations event publication failed." },
      { status: 500 },
    );
  }
}
