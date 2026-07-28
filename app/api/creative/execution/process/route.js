export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";

import {
  CreativeExecutionJobRuntime,
} from "@/lib/creative/execution/runtime/CreativeExecutionJobRuntime";

function text(value) {
  return String(value ?? "").trim();
}

function authorized(request) {
  const configured = text(process.env.CREATIVE_EXECUTION_WORKER_SECRET);
  if (!configured) return false;

  const authorization = text(request.headers.get("authorization"));
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const headerSecret = text(
    request.headers.get("x-creative-worker-secret"),
  );
  return bearer === configured || headerSecret === configured;
}

export async function POST(request) {
  if (!authorized(request)) {
    return Response.json({
      success: false,
      error: "CREATIVE_EXECUTION_WORKER_UNAUTHORIZED",
      production_started: false,
    }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const workerId = text(body.worker_id || body.workerId) ||
      `creative-http-worker-${crypto.randomUUID()}`;
    const result = await CreativeExecutionJobRuntime.processOne({
      worker_id: workerId,
      lease_seconds: Number(body.lease_seconds || body.leaseSeconds || 300),
    });

    return Response.json({
      success: true,
      ...result,
      production_started: false,
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error?.message || String(error),
      production_started: false,
    }, { status: 500 });
  }
}

export async function GET(request) {
  return POST(request);
}
