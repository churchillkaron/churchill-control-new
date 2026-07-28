export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  resolveOperationsRequestContext,
  searchParamsToObject,
} from "@/lib/operations/api/resolveOperationsRequestContext";

function respond(result) {
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const { searchParams } = new URL(request.url);
  const input = searchParamsToObject(searchParams);
  const resolved = await resolveOperationsRequestContext({ request, input });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error, rows: [] },
      { status: resolved.status || 400 },
    );
  }

  const {
    organizationId,
    organization_id,
    entityId,
    entity_id,
    periodId,
    period_id,
    id,
    record_id,
    ...filters
  } = input;

  if (id || record_id) {
    return respond(await serverOperationsApi.detail({
      capabilityId,
      id: id || record_id,
      context: resolved.context,
    }));
  }

  return respond(await serverOperationsApi.list({
    capabilityId,
    context: resolved.context,
    filters,
  }));
}

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const body = await request.json();
  const resolved = await resolveOperationsRequestContext({ request, input: body });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status || 400 },
    );
  }

  const command = String(body.command || "create").trim();

  return respond(await serverOperationsApi.execute({
    capabilityId,
    command,
    context: resolved.context,
    payload: {
      ...body,
      created_by: resolved.user?.id || null,
      updated_by: resolved.user?.id || null,
    },
  }));
}

export async function PATCH(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const body = await request.json();
  const resolved = await resolveOperationsRequestContext({ request, input: body });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status || 400 },
    );
  }

  return respond(await serverOperationsApi.execute({
    capabilityId,
    command: String(body.command || "update").trim(),
    context: resolved.context,
    payload: {
      ...body,
      updated_by: resolved.user?.id || null,
    },
  }));
}
