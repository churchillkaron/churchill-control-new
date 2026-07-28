export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { serverOperationsApi } from "@/lib/operations/api/createServerOperationsApi";
import {
  resolveOperationsRequestContext,
} from "@/lib/operations/api/resolveOperationsRequestContext";

export async function POST(request, { params }) {
  const resolvedParams = await params;
  const capabilityId = String(resolvedParams?.capabilityId || "").trim();
  const command = String(resolvedParams?.command || "").trim();
  const body = await request.json();
  const resolved = await resolveOperationsRequestContext({ request, input: body });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
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

  return NextResponse.json(result.body, { status: result.status });
}
