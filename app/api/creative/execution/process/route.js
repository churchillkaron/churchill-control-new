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

function configuredSecrets() {
  return [
    process.env.CREATIVE_EXECUTION_WORKER_SECRET,
    process.env.CRON_SECRET,
  ].map(text).filter(Boolean);
}

function authorized(request) {
  const secrets = configuredSecrets();
  if (!secrets.length) return false;

  const authorization = text(request.headers.get("authorization"));
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  const headerSecret = text(
    request.headers.get("x-creative-worker-secret"),
  );
  return secrets.includes(bearer) || secrets.includes(headerSecret);
}

async function process(request, body = {}) {
  if (!authorized(request)) {
    return Response.json({
      success: false,
      error: "CREATIVE_EXECUTION_WORKER_UNAUTHORIZED",
      production_started: false,
    }, { status: 401 });
  }

  try {
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
    console.error("CREATIVE_EXECUTION_WORKER_FAILED", {
      message: error?.message || String(error),
      cause: error?.cause?.message || null,
      stack: error?.stack || null,
    });
    return Response.json({
      success: false,
      error: error?.message || String(error),
      cause: error?.cause?.message || null,
      production_started: false,
    }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  return process(request, body);
}

export async function GET(request) {
  return process(request, {});
}
