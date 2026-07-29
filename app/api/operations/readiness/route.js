export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  resolveOperationsRequestContext,
  searchParamsToObject,
} from "@/lib/operations/api/resolveOperationsRequestContext";
import { getOperationsReadiness } from "@/lib/operations/readiness/OperationsReadinessService";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const resolved = await resolveOperationsRequestContext({
    request,
    input: searchParamsToObject(searchParams),
    authorize: false,
  });

  if (!resolved.success) {
    return NextResponse.json(
      { ok: false, status: "unavailable", error: resolved.error },
      { status: resolved.status || 400 },
    );
  }

  try {
    const readiness = await getOperationsReadiness({
      context: resolved.context,
    });

    return NextResponse.json(readiness, {
      status: readiness.ok ? 200 : 503,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "unavailable",
        error: error.message || "Operations readiness check failed.",
      },
      { status: 500 },
    );
  }
}
