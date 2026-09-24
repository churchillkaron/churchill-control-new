export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { runCronRouteLocalFirst } from "@/lib/platform/service-runtime/policy/CronRouteComputePolicyRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const LOCAL_MODEL = "Qwen/Qwen3-4B-GGUF:Q4_K_M";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret) &&
    request.headers.get("authorization") === `Bearer ${secret}`;
}

function text(value) {
  return String(value ?? "").trim();
}

async function settle(execution, capability, executionLane) {
  if (execution?.pending !== true) return execution;
  const provider = text(execution?.provider);
  const providerJobId = text(execution?.provider_job_id);
  const usageId = text(execution?.usage?.id);
  if (!provider || !providerJobId || !usageId) {
    throw new Error("LOCAL_REVIEW_BENCHMARK_PENDING_BINDING_REQUIRED");
  }

  for (let poll = 1; poll <= 120; poll += 1) {
    const settled = await ServiceExecutionRuntime.settle({
      organization_id: ORGANIZATION_ID,
      provider,
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: execution?.pricing || {},
      quantity: execution?.usage?.quantity ?? 1,
      unit: execution?.usage?.unit || execution?.pricing?.unit || "request",
      metadata: {
        benchmark_only: true,
        repository_head: text(process.env.VERCEL_GIT_COMMIT_SHA),
        benchmark_contract: capability === "ai.reasoning.execute"
          ? "AVANTIQO_LOCAL_REASONING_CERTIFICATION_V1"
          : "AVANTIQO_LOCAL_REVIEW_TEXT_CERTIFICATION_V1",
        compute_target: "AVANTIQO_LOCAL_NODE_V1",
        local_compute_required: true,
        modal_fallback_forbidden: true,
        benchmark_poll: poll,
      },
      provider_status_input: {
        capability,
        execution_lane: executionLane,
        model: LOCAL_MODEL,
        infrastructure_policy: "local_only",
        local_compute_required: true,
      },
      credential_id: execution?.credential_id || null,
      started_at: execution?.started_at || null,
    });

    if (settled?.pending === true) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (settled?.failed === true || settled?.success !== true) {
      throw new Error(settled?.error || "LOCAL_REVIEW_BENCHMARK_FAILED");
    }
    return settled;
  }

  throw new Error("LOCAL_REVIEW_BENCHMARK_TIMEOUT");
}

async function handleCronGet(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const repositoryHead = text(process.env.VERCEL_GIT_COMMIT_SHA);
  if (!/^[0-9a-f]{40}$/i.test(repositoryHead)) {
    return Response.json(
      { success: false, error: "VERCEL_GIT_COMMIT_SHA_REQUIRED" },
      { status: 500 },
    );
  }

  try {
    const url = new URL(request.url);
    const requestedCapability = text(url.searchParams.get("capability"));
    const capability = requestedCapability === "ai.reasoning.execute"
      ? "ai.reasoning.execute"
      : "ai.text.generate";
    const executionLane = capability === "ai.reasoning.execute" ? "deep" : "fast";
    const execution = await ServiceExecutionRuntime.execute({
      organization_id: ORGANIZATION_ID,
      service_id: capability,
      provider_id: "avantiqo-intelligence",
      input: {
        capability,
        execution_lane: executionLane,
        model: LOCAL_MODEL,
        infrastructure_policy: "local_only",
        local_compute_required: true,
        max_output_tokens: 120,
        temperature: 0.1,
        prompt: capability === "ai.reasoning.execute"
          ? "Analyze whether 17 + 25 equals 42 and return only valid JSON: {\"ok\":true,\"answer\":42,\"message\":\"local reasoning benchmark passed\"}"
          : "Return only valid JSON: {\"ok\":true,\"message\":\"local review benchmark passed\"}",
        response_format: { type: "json_object" },
      },
      provider_policy: {
        allowed_providers: ["avantiqo-intelligence"],
        allowed_models: [LOCAL_MODEL],
        preferred_models: [LOCAL_MODEL],
        execution_scope: "BENCHMARK_REVIEW_PREVIEW",
        benchmark_only: true,
        owned_only_required: true,
        external_fallback_allowed: false,
        studio_preproduction_review: true,
        benchmark_pricing_estimate: {
          input_tokens: 256,
          output_tokens: 120,
        },
      },
      metadata: {
        benchmark_only: true,
        repository_head: repositoryHead,
        benchmark_contract: capability === "ai.reasoning.execute"
          ? "AVANTIQO_LOCAL_REASONING_CERTIFICATION_V1"
          : "AVANTIQO_LOCAL_REVIEW_TEXT_CERTIFICATION_V1",
        compute_target: "AVANTIQO_LOCAL_NODE_V1",
        local_compute_required: true,
        modal_fallback_forbidden: true,
      },
      category: "AI",
    });

    const result = await settle(execution, capability, executionLane);
    return Response.json({
      success: true,
      repositoryHead,
      capability,
      executionLane,
      provider: result?.provider || execution?.provider || null,
      providerJobId: result?.provider_job_id || execution?.provider_job_id || null,
      usageId: result?.usage?.id || execution?.usage?.id || null,
      output: result?.output || null,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        repositoryHead,
        error: error?.message || "Local review benchmark failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request) {
  return runCronRouteLocalFirst(() => handleCronGet(request), { source: "VERCEL_CRON" });
}
