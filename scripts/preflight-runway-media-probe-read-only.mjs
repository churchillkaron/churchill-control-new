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
  process.env.RUNWAY_MEDIA_PROBE_PREFLIGHT_OUTPUT ||
  "/tmp/churchill-runway-media-probe-preflight.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("RUNWAY_MEDIA_PROBE_PREFLIGHT_SCOPE_REQUIRED");
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
const { prepareRunwayProviderInputByProbe } = await import(
  "@/lib/platform/service-runtime/providers/runway/RunwayProviderMediaProbeRuntime"
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
  throw new Error(`RUNWAY_MEDIA_PROBE_TASK_COUNT_INVALID:${graphTasks.length}`);
}
if (failedVideos.length !== 13) {
  throw new Error(
    `RUNWAY_MEDIA_PROBE_FAILED_VIDEO_COUNT_INVALID:${failedVideos.length}`,
  );
}

const serviceCapabilities = resolveServiceCapabilities("ai.video.generate");
const capability = resolvePrimaryExecutionCapability(
  serviceCapabilities?.capabilities || [],
);
if (!capability) throw new Error("RUNWAY_MEDIA_PROBE_CAPABILITY_UNAVAILABLE");

const results = [];
for (const task of failedVideos) {
  const executionNodeId = text(
    task.metadata?.execution_node_id || task.input?.node_id,
  );

  try {
    const selected = await resolveProvider({
      organization_id: organizationId,
      capability,
      preferredProvider: "runway",
      country: task.input?.country || null,
      currency: task.input?.currency || null,
      policy: {
        ...object(task.provider_policy),
        ...object(task.input?.provider_policy),
      },
    });
    if (text(selected.provider).toLowerCase() !== "runway") {
      throw new Error(`RUNWAY_MEDIA_PROBE_PROVIDER_DRIFT:${selected.provider}`);
    }

    const baseInput = {
      capability,
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

    const prepared = await prepareRunwayProviderInputByProbe(baseInput);
    const request = await RunwayProviderRequestRuntime.build(prepared);
    const frame = object(prepared.runway_source_frame_contract);
    const source = object(request.source);
    const bodyKeys = Object.keys(object(request.body)).sort();
    const promptImage = text(request.body?.promptImage);
    const framePrepared = frame.prepared === true;
    const requestEncodedBytes = Number(source.encoded_bytes || 0);
    const frameEncodedBytes = Number(frame.encoded_bytes || 0);
    const effectiveEncodedBytes = framePrepared
      ? frameEncodedBytes
      : requestEncodedBytes;
    const effectiveSourceBytes = framePrepared
      ? Number(frame.source_bytes || 0)
      : Number(source.source_bytes || 0);
    const effectiveNormalizedBytes = framePrepared
      ? Number(frame.frame_bytes || 0)
      : Number(source.normalized_bytes || 0);
    const effectiveWidth = framePrepared
      ? Number(frame.width || 0)
      : Number(source.width || 0);
    const effectiveHeight = framePrepared
      ? Number(frame.height || 0)
      : Number(source.height || 0);
    const normalizedImageTransportValid =
      !framePrepared &&
      source.transport === "DATA_URI_NORMALIZED_JPEG" &&
      requestEncodedBytes > 0 &&
      requestEncodedBytes <= 5 * 1024 * 1024 &&
      effectiveWidth > 0 &&
      effectiveHeight > 0;
    const preparedFrameTransportValid =
      framePrepared &&
      frame.contract === "RUNWAY_APPROVED_VIDEO_SOURCE_FRAME_V2" &&
      frame.detection === "FFPROBE_VIDEO_STREAM" &&
      frame.source_media_kind === "video" &&
      source.transport === "DATA_URI_EXISTING" &&
      text(source.content_type).toLowerCase() === "image/jpeg" &&
      frameEncodedBytes > 0 &&
      frameEncodedBytes <= 5 * 1024 * 1024 &&
      requestEncodedBytes === frameEncodedBytes &&
      effectiveSourceBytes > 0 &&
      effectiveNormalizedBytes > 0 &&
      effectiveWidth > 0 &&
      effectiveHeight > 0 &&
      Number(frame.sample_fraction) === 0.5 &&
      Number(frame.sample_second) >= 0 &&
      Number(frame.source_duration_seconds) > 0;
    const bodyKeysValid = bodyKeys.every((key) => [
      "contentModeration",
      "duration",
      "model",
      "negativePrompt",
      "promptImage",
      "promptText",
      "ratio",
      "seed",
    ].includes(key));
    const pass =
      text(request.model) === text(selected.model) &&
      /^data:image\/jpeg;base64,/i.test(promptImage) &&
      (normalizedImageTransportValid || preparedFrameTransportValid) &&
      bodyKeysValid;

    results.push({
      task_id: task.id,
      execution_node_id: executionNodeId,
      success: pass,
      error: pass ? null : "RUNWAY_MEDIA_PROBE_CONTRACT_INVALID",
      provider: selected.provider,
      model: selected.model,
      request_model: request.model,
      source_transport: source.transport || null,
      source_content_type:
        source.content_type || source.source_content_type || null,
      source_bytes: effectiveSourceBytes,
      normalized_bytes: effectiveNormalizedBytes,
      encoded_bytes: effectiveEncodedBytes,
      width: effectiveWidth,
      height: effectiveHeight,
      ratio: request.body?.ratio || null,
      duration: request.body?.duration || null,
      body_keys: bodyKeys,
      frame_contract: frame.contract || null,
      frame_prepared: framePrepared,
      frame_detection: frame.detection || null,
      frame_sample_fraction: frame.sample_fraction ?? null,
      frame_sample_second: frame.sample_second ?? null,
      frame_duration_seconds: frame.source_duration_seconds ?? null,
      normalized_image_transport_valid: normalizedImageTransportValid,
      prepared_frame_transport_valid: preparedFrameTransportValid,
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
const passCount = results.filter((result) => result.success).length;
const failCount = results.length - passCount;

const output = {
  contract: "CHURCHILL_RUNWAY_MEDIA_PROBE_PREFLIGHT_V2",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
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
console.log("READ-ONLY RUNWAY MEDIA PROBE PREFLIGHT V2");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${results.length}`);
console.log(`PASS_COUNT=${passCount}`);
console.log(`FAIL_COUNT=${failCount}`);
for (const result of results) {
  console.log([
    "MEDIA_PROBE",
    result.execution_node_id,
    `status=${result.success ? "PASS" : "FAIL"}`,
    `error=${result.error || ""}`,
    `provider=${result.provider || ""}`,
    `model=${result.model || ""}`,
    `request_model=${result.request_model || ""}`,
    `transport=${result.source_transport || ""}`,
    `source_content_type=${result.source_content_type || ""}`,
    `frame_contract=${result.frame_contract || ""}`,
    `frame_prepared=${result.frame_prepared ? "YES" : "NO"}`,
    `frame_detection=${result.frame_detection || ""}`,
    `sample_fraction=${result.frame_sample_fraction ?? ""}`,
    `sample_second=${result.frame_sample_second ?? ""}`,
    `bytes=${result.source_bytes || 0}`,
    `normalized=${result.normalized_bytes || 0}`,
    `encoded=${result.encoded_bytes || 0}`,
    `dimensions=${result.width || 0}x${result.height || 0}`,
    `ratio=${result.ratio || ""}`,
    `duration=${result.duration || ""}`,
    `body_keys=${(result.body_keys || []).join(",")}`,
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
