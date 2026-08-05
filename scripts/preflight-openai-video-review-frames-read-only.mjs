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

function directUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return text(value) || null;
  if (typeof value !== "object") return null;
  return text(
    value.video_url ||
    value.videoUrl ||
    value.file_url ||
    value.fileUrl ||
    value.image_url ||
    value.imageUrl ||
    value.url,
  ) || null;
}

function outputValue(output = {}) {
  return output?.output?.output || output?.output || output || {};
}

function outputUrl(output = {}) {
  const value = outputValue(output);
  return value.image_url ||
    value.imageUrl ||
    value.video_url ||
    value.videoUrl ||
    value.file_url ||
    value.fileUrl ||
    value.url ||
    value.result?.url ||
    (typeof value.result === "string" ? value.result : null) ||
    null;
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
  process.env.OPENAI_VIDEO_REVIEW_PREFLIGHT_OUTPUT ||
  "/tmp/churchill-openai-video-review-frame-preflight.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_VIDEO_REVIEW_PREFLIGHT_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { prepareOpenAIVideoAnalysisInput } = await import(
  "@/lib/platform/service-runtime/providers/openai/OpenAIVideoAnalysisFrameRuntime"
);
const { OpenAIProviderSanitizedRuntime } = await import(
  "@/lib/platform/service-runtime/providers/openai/OpenAIProviderSanitizedRuntime"
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
const failedReviews = graphTasks.filter((task) =>
  text(task.status).toUpperCase() === "FAILED" &&
  text(task.provider_id).toLowerCase() === "openai" &&
  text(task.capability || task.service_code).toLowerCase() ===
    "ai.image.analyze" &&
  text(task.metadata?.contract) === "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1",
);

if (graphTasks.length !== 27) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_PREFLIGHT_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (failedReviews.length !== 13) {
  throw new Error(
    `OPENAI_VIDEO_REVIEW_PREFLIGHT_FAILED_COUNT_INVALID:${failedReviews.length}`,
  );
}

const taskMap = new Map(graphTasks.map((task) => [task.id, task]));
const results = [];

for (const task of failedReviews) {
  const executionNodeId = text(task.metadata?.execution_node_id);
  try {
    const dependencies = list(task.depends_on)
      .map((id) => taskMap.get(id))
      .filter(Boolean);
    const source = dependencies.find((dependency) =>
      text(dependency.status).toUpperCase() === "COMPLETED" &&
      text(dependency.provider_id).toLowerCase() === "runway" &&
      text(dependency.capability || dependency.service_code).toLowerCase() ===
        "ai.video.generate",
    );
    if (!source) {
      throw new Error("OPENAI_VIDEO_REVIEW_SOURCE_DEPENDENCY_REQUIRED");
    }
    const sourceUrl = outputUrl(source.output);
    if (!sourceUrl) {
      throw new Error("OPENAI_VIDEO_REVIEW_SOURCE_URL_REQUIRED");
    }

    const baseInput = {
      ...object(task.input),
      capability: "ai.image.analyze",
      media_kind: "VIDEO",
      video: sourceUrl,
      media: sourceUrl,
      source: sourceUrl,
      image: sourceUrl,
      context: {
        ...object(task.input?.context),
        organization_id: organizationId,
        creative_project_id: projectId,
        production_graph_id: graphId,
        production_task_id: task.id,
      },
    };
    const prepared = await prepareOpenAIVideoAnalysisInput(baseInput);
    const contract = object(prepared.openai_video_analysis_frame_contract);
    const assets = list(prepared.assets);
    const frameAssets = assets.filter((asset) =>
      text(asset.role) === "GENERATED_VIDEO_FRAME_UNDER_REVIEW",
    );
    const localized = await OpenAIProviderSanitizedRuntime.localizeAnalysisMedia(
      OpenAIProviderSanitizedRuntime.sanitizeResponses(prepared),
    );
    const localizedAssets = list(localized.assets);
    const localizedFrameAssets = localizedAssets.filter((asset) =>
      text(asset.role) === "GENERATED_VIDEO_FRAME_UNDER_REVIEW",
    );
    const frameDataValid = frameAssets.every((asset) =>
      /^data:image\/jpeg;base64,/i.test(text(asset.url)),
    );
    const localizedDataValid = localizedFrameAssets.every((asset) =>
      /^data:image\/jpeg;base64,/i.test(text(asset.url)),
    );
    const frameMetricsValid =
      list(contract.frames).length === 7 &&
      list(contract.frames).every((frame, index) =>
        Number(frame.index) === index + 1 &&
        Number(frame.width) > 0 &&
        Number(frame.height) > 0 &&
        Number(frame.jpeg_bytes) > 0 &&
        Number(frame.encoded_bytes) > 0 &&
        Number(frame.encoded_bytes) <= 2 * 1024 * 1024 &&
        Number(frame.timestamp_seconds) >= 0,
      );
    const fractionsValid =
      JSON.stringify(list(contract.fractions)) ===
      JSON.stringify([0.02, 0.18, 0.34, 0.5, 0.66, 0.82, 0.98]);
    const rawVideoAbsent =
      prepared.image === undefined &&
      prepared.media === undefined &&
      prepared.source === undefined &&
      !assets.some((asset) => directUrl(asset) === sourceUrl);
    const pass =
      contract.contract === "OPENAI_VIDEO_ANALYSIS_FRAME_SET_V1" &&
      contract.prepared === true &&
      contract.source_media_kind === "video" &&
      contract.frame_count === 7 &&
      contract.source_url_persisted === false &&
      contract.frame_data_persisted === false &&
      contract.boundary === "OPENAI_ANALYSIS_TRANSPORT_ONLY" &&
      Number(contract.source_duration_seconds) > 0 &&
      Number(contract.source_file_size_bytes) > 0 &&
      frameAssets.length === 7 &&
      localizedFrameAssets.length === 7 &&
      frameDataValid &&
      localizedDataValid &&
      frameMetricsValid &&
      fractionsValid &&
      rawVideoAbsent;

    results.push({
      task_id: task.id,
      execution_node_id: executionNodeId,
      source_task_id: source.id,
      success: pass,
      error: pass ? null : "OPENAI_VIDEO_REVIEW_FRAME_CONTRACT_INVALID",
      frame_contract: contract.contract || null,
      frame_count: Number(contract.frame_count || 0),
      source_duration_seconds:
        Number(contract.source_duration_seconds || 0),
      source_file_size_bytes:
        Number(contract.source_file_size_bytes || 0),
      frame_fractions: list(contract.fractions),
      frame_dimensions: list(contract.frames).map((frame) =>
        `${Number(frame.width || 0)}x${Number(frame.height || 0)}`,
      ),
      frame_encoded_bytes: list(contract.frames).map((frame) =>
        Number(frame.encoded_bytes || 0),
      ),
      raw_video_absent: rawVideoAbsent,
      localized_frame_count: localizedFrameAssets.length,
      source_url_logged: false,
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
  contract: "CHURCHILL_OPENAI_VIDEO_REVIEW_FRAME_PREFLIGHT_V1",
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
console.log("READ-ONLY OPENAI VIDEO REVIEW FRAME PREFLIGHT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${results.length}`);
console.log(`PASS_COUNT=${passCount}`);
console.log(`FAIL_COUNT=${failCount}`);
for (const result of results) {
  console.log([
    "VIDEO_REVIEW_FRAME",
    result.execution_node_id,
    `status=${result.success ? "PASS" : "FAIL"}`,
    `error=${result.error || ""}`,
    `contract=${result.frame_contract || ""}`,
    `frame_count=${result.frame_count || 0}`,
    `localized_frame_count=${result.localized_frame_count || 0}`,
    `duration=${result.source_duration_seconds || 0}`,
    `source_bytes=${result.source_file_size_bytes || 0}`,
    `raw_video_absent=${result.raw_video_absent ? "YES" : "NO"}`,
    `dimensions=${list(result.frame_dimensions).join(",")}`,
    `encoded=${list(result.frame_encoded_bytes).join(",")}`,
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
