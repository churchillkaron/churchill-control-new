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
  const recordId = String(resolvedParams?.recordId || "").trim();
  const { searchParams } = new URL(request.url);
  const resolved = await resolveOperationsRequestContext({
    request,
    input: searchParamsToObject(searchParams),
  });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status || 400 },
    );
  }

  return respond(await serverOperationsApi.detail({
    capabilityId,
    id: recordId,
    context: resolved.context,
  }));
}

export async function PATCH(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const recordId = String(resolvedParams?.recordId || "").trim();
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
      id: recordId,
      updated_by: resolved.user?.id || null,
    },
  }));
}
