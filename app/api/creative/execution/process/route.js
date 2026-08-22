export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Direction can legitimately contain several serialized governed reasoning calls.
// Keep the function ceiling below the default 900-second execution lease so the
// invocation fails before its lease can expire, while giving short-form direction
// enough time to finish its bounded in-job validation/repair path.
export const maxDuration = 800;

import crypto from "node:crypto";

import "@/lib/creative/execution/runtime/CreativeServiceExecutionEnvelopeCompatibility";
import {
  CreativeExecutionJobRuntime,
} from "@/lib/creative/execution/runtime/CreativeExecutionJobRuntime";
import {
  CreativePartnerSchedulerRuntime,
} from "@/lib/creative/partner/runtime/CreativePartnerSchedulerRuntime";

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

async function processRequest(request, body = {}) {
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
    const executionJob = await CreativeExecutionJobRuntime.processOne({
      worker_id: workerId,
      lease_seconds: Number(body.lease_seconds || body.leaseSeconds || 900),
    });
    const partnerScheduler = await CreativePartnerSchedulerRuntime.process({
      limit: Number(body.partner_limit || body.partnerLimit || 4),
    });

    return Response.json({
      success: true,
      execution_job: executionJob,
      creative_partner: partnerScheduler,
      production_started: false,
      provider_selection_exposed: false,
      raw_reasoning_persisted: false,
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
  return processRequest(request, body);
}

export async function GET(request) {
  return processRequest(request, {});
}
