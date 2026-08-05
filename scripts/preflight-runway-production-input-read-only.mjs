#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

async function exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
}) {
  const [tasks, usageResult, walletResult] = await Promise.all([
    ProductionTaskRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      production_graph_id: graphId,
    }),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance")
      .eq("organization_id", organizationId)
      .single(),
  ]);

  if (usageResult.error) throw usageResult.error;
  if (walletResult.error) throw walletResult.error;

  return {
    task_count: tasks.filter((task) =>
      text(task.production_graph_id) === graphId,
    ).length,
    usage_count: Number(usageResult.count || 0),
    wallet_balance: money(walletResult.data?.available_balance),
  };
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = text(
  process.env.RUNWAY_PRODUCTION_INPUT_PREFLIGHT_OUTPUT ||
  "/tmp/churchill-runway-production-input-preflight.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("RUNWAY_PRODUCTION_INPUT_PREFLIGHT_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { resolveProvider } = await import(
  "@/lib/platform/service-runtime/providers/ProviderResolver"
);
const { resolveServiceCapabilities } = await import(
  "@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"
);
const { resolvePrimaryExecutionCapability } = await import(
  "@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"
);
const { prepareRunwayProviderInput } = await import(
  "@/lib/platform/service-runtime/providers/runway/RunwayProviderInputRuntime"
);
const { RunwayProviderRequestRuntime } = await import(
  "@/lib/platform/service-runtime/providers/runway/RunwayProvider"
);

const stateBefore = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});

const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const graphTasks = tasks.filter((task) =>
  text(task.production_graph_id) === graphId,
);
const failedVideos = graphTasks.filter((task) =>
  text(task.status).toUpperCase() === "FAILED" &&
  text(task.provider_id).toLowerCase() === "runway" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.video.generate" &&
  text(task.error) === "RUNWAY_PROMPT_IMAGE_FETCH_FAILED:400",
);

if (graphTasks.length !== 27) {
  throw new Error(
    `RUNWAY_PRODUCTION_INPUT_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (failedVideos.length !== 13) {
  throw new Error(
    `RUNWAY_PRODUCTION_INPUT_FAILED_VIDEO_COUNT_INVALID:${failedVideos.length}`,
  );
}

const serviceCapabilities = resolveServiceCapabilities("ai.video.generate");
const executionCapability = resolvePrimaryExecutionCapability(
  serviceCapabilities?.capabilities || [],
);
if (!executionCapability) {
  throw new Error("RUNWAY_PRODUCTION_INPUT_CAPABILITY_UNAVAILABLE");
}

const results = [];
for (const task of failedVideos) {
  const executionNodeId = text(
    task.metadata?.execution_node_id || task.input?.node_id,
  );
  try {
    const selected = await resolveProvider({
      organization_id: organizationId,
      capability: executionCapability,
      preferredProvider: "runway",
      country: task.input?.country || null,
      currency: task.input?.currency || null,
      policy: {
        ...object(task.provider_policy),
        ...object(task.input?.provider_policy),
      },
    });
    if (text(selected.provider).toLowerCase() !== "runway") {
      throw new Error(
        `RUNWAY_PRODUCTION_INPUT_PROVIDER_DRIFT:${selected.provider}`,
      );
    }

    const baseInput = {
      capability: executionCapability,
      model: selected.model,
      ...object(task.input),
      payload: object(task.input),
      context: {
        ...object(task.input?.context),
        organization_id: organizationId,
        creative_project_id: projectId,
        production_graph_id: graphId,
        production_task_id: task.id,
        credential_id: selected.credential_id || null,
      },
      credential_id: selected.credential_id || null,
    };
    const prepared = await prepareRunwayProviderInput(baseInput);
    const request = await RunwayProviderRequestRuntime.build(prepared);

    const promptImage = text(request.body?.promptImage);
    const dataUriValid = /^data:image\/jpeg;base64,/i.test(promptImage);
    const source = object(request.source);
    const frame = object(prepared.runway_source_frame_contract);
    const bodyKeys = Object.keys(object(request.body)).sort();
    const pass =
      text(request.model) === text(selected.model) &&
      dataUriValid &&
      source.transport === "DATA_URI_NORMALIZED_JPEG" &&
      Number(source.encoded_bytes || 0) > 0 &&
      Number(source.encoded_bytes || 0) <= 5 * 1024 * 1024 &&
      bodyKeys.every((key) => [
        "contentModeration",
        "duration",
        "model",
        "negativePrompt",
        "promptImage",
        "promptText",
        "ratio",
        "seed",
      ].includes(key));

    results.push({
      task_id: task.id,
      execution_node_id: executionNodeId,
      success: pass,
      error: pass ? null : "RUNWAY_PRODUCTION_INPUT_CONTRACT_INVALID",
      selected_provider: selected.provider,
      selected_model: selected.model,
      request_model: request.model,
      endpoint: request.endpoint,
      body_keys: bodyKeys,
      ratio: request.body?.ratio || null,
      duration: request.body?.duration || null,
      prompt_length: text(request.body?.promptText).length,
      prompt_image_data_uri_valid: dataUriValid,
      source_transport: source.transport || null,
      source_content_type: source.content_type || null,
      source_content_type_original: source.source_content_type || null,
      source_bytes: Number(source.source_bytes || 0),
      normalized_bytes: Number(source.normalized_bytes || 0),
      encoded_bytes: Number(source.encoded_bytes || 0),
      width: Number(source.width || 0),
      height: Number(source.height || 0),
      aspect_ratio: Number(source.aspect_ratio || 0),
      frame_contract: frame.contract || null,
      frame_prepared: frame.prepared === true,
      frame_source_media_kind: frame.source_media_kind || null,
      frame_sample_fraction: frame.sample_fraction ?? null,
      frame_sample_second: frame.sample_second ?? null,
      frame_duration_seconds: frame.source_duration_seconds ?? null,
    });
  } catch (error) {
    results.push({
      task_id: task.id,
      execution_node_id: executionNodeId,
      success: false,
      error: text(error?.message || error),
    });
  }
}

const stateAfter = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged = JSON.stringify(stateBefore) === JSON.stringify(stateAfter);
const passCount = results.filter((result) => result.success === true).length;
const failCount = results.length - passCount;

const output = {
  contract: "CHURCHILL_RUNWAY_PRODUCTION_INPUT_PREFLIGHT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  execution_capability: executionCapability,
  task_count: results.length,
  pass_count: passCount,
  fail_count: failCount,
  results,
  exact_state_before: stateBefore,
  exact_state_after: stateAfter,
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  publication_authorized: false,
};
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log("============================================================");
console.log("READ-ONLY RUNWAY PRODUCTION INPUT PREFLIGHT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`EXECUTION_CAPABILITY=${executionCapability}`);
console.log(`TASK_COUNT=${results.length}`);
console.log(`PASS_COUNT=${passCount}`);
console.log(`FAIL_COUNT=${failCount}`);
for (const result of results) {
  console.log([
    "PRODUCTION_INPUT",
    result.execution_node_id,
    `status=${result.success ? "PASS" : "FAIL"}`,
    `error=${result.error || ""}`,
    `provider=${result.selected_provider || ""}`,
    `model=${result.selected_model || ""}`,
    `request_model=${result.request_model || ""}`,
    `transport=${result.source_transport || ""}`,
    `source_content_type=${result.source_content_type_original || ""}`,
    `frame_contract=${result.frame_contract || ""}`,
    `frame_prepared=${result.frame_prepared === true ? "YES" : "NO"}`,
    `sample_fraction=${result.frame_sample_fraction ?? ""}`,
    `sample_second=${result.frame_sample_second ?? ""}`,
    `bytes=${result.source_bytes || 0}`,
    `normalized=${result.normalized_bytes || 0}`,
    `encoded=${result.encoded_bytes || 0}`,
    `dimensions=${result.width || 0}x${result.height || 0}`,
    `ratio=${result.ratio || ""}`,
    `duration=${result.duration || ""}`,
    `body_keys=${list(result.body_keys).join(",")}`,
  ].join("|"));
}
console.log(`TASK_COUNT_BEFORE=${stateBefore.task_count}`);
console.log(`TASK_COUNT_AFTER=${stateAfter.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${stateBefore.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${stateAfter.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${stateBefore.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${stateAfter.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (!stateUnchanged || failCount > 0) process.exitCode = 2;
