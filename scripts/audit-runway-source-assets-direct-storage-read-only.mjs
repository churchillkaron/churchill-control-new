#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import sharp from "sharp";

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

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function assetSource(asset = {}) {
  return text(
    asset.storage_reference ||
    asset.storageReference ||
    asset.storage_url ||
    asset.storageUrl ||
    asset.file_url ||
    asset.fileUrl ||
    asset.image_url ||
    asset.imageUrl ||
    asset.url,
  );
}

function taskSourceAssetId(task = {}) {
  const input = object(task.input);
  return text(
    input.primary_source_asset_id ||
    input.reference_asset_id ||
    list(input.reference_asset_ids)[0] ||
    list(input.selected_assets)[0]?.asset_id ||
    list(input.selected_assets)[0]?.id,
  );
}

function safeUrl(value) {
  try {
    const parsed = new URL(value);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      query_present: Boolean(parsed.search),
    };
  } catch {
    return null;
  }
}

async function responseBody(response) {
  const raw = await response.text().catch(() => "");
  return raw.replace(/[A-Za-z0-9_-]{80,}/g, "[REDACTED]").slice(0, 1000);
}

async function exactState({ supabaseAdmin, ProductionTaskRuntime, organizationId, projectId, graphId }) {
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
    task_count: tasks.filter((task) => text(task.production_graph_id) === graphId).length,
    usage_count: Number(usageResult.count || 0),
    wallet_balance: money(walletResult.data?.available_balance),
  };
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = text(
  process.env.RUNWAY_SOURCE_STORAGE_AUDIT_OUTPUT ||
  "/tmp/churchill-runway-source-storage-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("RUNWAY_SOURCE_STORAGE_AUDIT_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { getServiceSupabase } = await import("@/lib/shared/supabase/service");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { CreativeAssetsRuntime } = await import(
  "@/lib/creative/assets/runtime/CreativeAssetsRuntime"
);
const {
  resolveCreativeProviderAssetUrl,
  CreativeProviderAssetUrlRuntime,
} = await import(
  "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl"
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
const graphTasks = tasks.filter((task) => text(task.production_graph_id) === graphId);
const failedVideos = graphTasks.filter((task) =>
  text(task.status).toUpperCase() === "FAILED" &&
  text(task.provider_id).toLowerCase() === "runway" &&
  text(task.capability || task.service_code).toLowerCase() === "ai.video.generate" &&
  text(task.error) === "RUNWAY_PROMPT_IMAGE_FETCH_FAILED:400",
);

if (graphTasks.length !== 27) {
  throw new Error(`RUNWAY_SOURCE_STORAGE_AUDIT_TASK_COUNT_INVALID:${graphTasks.length}`);
}
if (failedVideos.length !== 13) {
  throw new Error(`RUNWAY_SOURCE_STORAGE_AUDIT_FAILED_VIDEO_COUNT_INVALID:${failedVideos.length}`);
}

const taskBindings = failedVideos.map((task) => ({
  task_id: task.id,
  execution_node_id: text(task.metadata?.execution_node_id || task.input?.node_id),
  asset_id: taskSourceAssetId(task),
}));
for (const binding of taskBindings) {
  if (!binding.asset_id) {
    throw new Error(`RUNWAY_SOURCE_STORAGE_AUDIT_ASSET_ID_REQUIRED:${binding.task_id}`);
  }
}

const assetIds = unique(taskBindings.map((binding) => binding.asset_id));
const serviceSupabase = getServiceSupabase();
const assets = [];

for (const assetId of assetIds) {
  const asset = await CreativeAssetsRuntime.get(assetId);
  if (!asset || text(asset.organization_id) !== organizationId) {
    throw new Error(`RUNWAY_SOURCE_STORAGE_AUDIT_ASSET_NOT_FOUND:${assetId}`);
  }

  const source = assetSource(asset);
  const parsed =
    CreativeProviderAssetUrlRuntime.storageReference(source) ||
    CreativeProviderAssetUrlRuntime.supabaseSignedStorageReference(source);
  const record = {
    asset_id: assetId,
    asset_type: text(asset.asset_type || asset.type) || null,
    mime_type: text(asset.mime_type || asset.metadata?.mime_type) || null,
    source_kind: source.startsWith("storage://")
      ? "STORAGE_REFERENCE"
      : parsed
        ? "SUPABASE_SIGNED_URL"
        : /^https:\/\//i.test(source)
          ? "EXTERNAL_HTTPS"
          : "UNKNOWN",
    bucket: parsed?.bucket || null,
    path: parsed?.path || null,
    organization_path_valid: parsed
      ? parsed.path.startsWith(`${organizationId}/`)
      : null,
    direct_download: null,
    signed_url_fetch: null,
  };

  if (parsed) {
    const download = await serviceSupabase.storage
      .from(parsed.bucket)
      .download(parsed.path);
    if (download.error) {
      record.direct_download = {
        success: false,
        error: text(download.error.message || download.error),
        status_code: Number(download.error.statusCode || download.error.status || 0) || null,
      };
    } else {
      const buffer = Buffer.from(await download.data.arrayBuffer());
      let metadata = null;
      let decodeError = null;
      try {
        metadata = await sharp(buffer, { failOn: "error" }).metadata();
      } catch (error) {
        decodeError = text(error?.message || error);
      }
      record.direct_download = {
        success: true,
        bytes: buffer.length,
        blob_type: text(download.data.type) || null,
        image_decode_success: !decodeError,
        decode_error: decodeError,
        width: metadata?.width || null,
        height: metadata?.height || null,
        format: metadata?.format || null,
        aspect_ratio:
          metadata?.width && metadata?.height
            ? Number((metadata.width / metadata.height).toFixed(6))
            : null,
      };
    }
  }

  try {
    const signedUrl = await resolveCreativeProviderAssetUrl({
      organization_id: organizationId,
      value: assetId,
    });
    const response = await fetch(signedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "image/jpeg,image/png,image/webp,*/*;q=0.1",
        "User-Agent": "Avantiqo-Creative-Source-Audit/1.0",
      },
    });
    const body = response.ok ? "" : await responseBody(response);
    record.signed_url_fetch = {
      success: response.ok,
      status: response.status,
      content_type: text(response.headers.get("content-type")) || null,
      content_length: text(response.headers.get("content-length")) || null,
      safe_url: safeUrl(signedUrl),
      error_body: body || null,
    };
  } catch (error) {
    record.signed_url_fetch = {
      success: false,
      status: null,
      error: text(error?.message || error),
    };
  }

  assets.push(record);
}

const stateAfter = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged = JSON.stringify(stateBefore) === JSON.stringify(stateAfter);
const directPass = assets.filter((asset) =>
  asset.direct_download?.success === true &&
  asset.direct_download?.image_decode_success === true,
).length;
const signedFetchPass = assets.filter((asset) => asset.signed_url_fetch?.success === true).length;

const output = {
  contract: "CHURCHILL_RUNWAY_SOURCE_STORAGE_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  failed_video_task_count: failedVideos.length,
  unique_source_asset_count: assetIds.length,
  task_bindings: taskBindings,
  assets,
  direct_download_pass_count: directPass,
  signed_url_fetch_pass_count: signedFetchPass,
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
console.log("READ-ONLY RUNWAY SOURCE STORAGE AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`FAILED_VIDEO_TASK_COUNT=${failedVideos.length}`);
console.log(`UNIQUE_SOURCE_ASSET_COUNT=${assetIds.length}`);
for (const asset of assets) {
  console.log([
    "ASSET_AUDIT",
    asset.asset_id,
    `kind=${asset.source_kind}`,
    `bucket=${asset.bucket || ""}`,
    `organization_path=${asset.organization_path_valid === true ? "PASS" : asset.organization_path_valid === false ? "FAIL" : "N/A"}`,
    `direct_download=${asset.direct_download?.success === true ? "PASS" : "FAIL"}`,
    `decode=${asset.direct_download?.image_decode_success === true ? "PASS" : "FAIL"}`,
    `bytes=${asset.direct_download?.bytes || 0}`,
    `dimensions=${asset.direct_download?.width || 0}x${asset.direct_download?.height || 0}`,
    `signed_fetch_status=${asset.signed_url_fetch?.status ?? "ERROR"}`,
    `signed_fetch_body=${asset.signed_url_fetch?.error_body || asset.signed_url_fetch?.error || ""}`,
  ].join("|"));
}
console.log(`DIRECT_DOWNLOAD_PASS_COUNT=${directPass}`);
console.log(`SIGNED_URL_FETCH_PASS_COUNT=${signedFetchPass}`);
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

if (!stateUnchanged || directPass !== assets.length) {
  process.exitCode = 2;
}
