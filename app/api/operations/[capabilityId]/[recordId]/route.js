export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  resolveOperationsRequestContext,
  searchParamsToObject,
} from "@/lib/operations/api/resolveOperationsRequestContext";
import { OPERATIONS_ACTIONS } from "@/lib/operations/security/OperationsAuthorizationPolicy";

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
    capabilityId,
    action: OPERATIONS_ACTIONS.VIEW,
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
  const command = String(body.command || "update").trim();
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

  return respond(await serverOperationsApi.execute({
    capabilityId,
    command,
    context: resolved.context,
    payload: {
      ...body,
      id: recordId,
      updated_by: resolved.user?.id || null,
      actor_id: resolved.user?.id || null,
    },
  }));
}
