#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
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

function decodePath(value) {
  return text(value)
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/");
}

function parseStorageUrl(value) {
  const source = text(value);
  if (!/^https:\/\//i.test(source)) return null;

  let parsed;
  try {
    parsed = new URL(source);
  } catch {
    return null;
  }

  const patterns = [
    {
      expression: /^\/storage\/v1\/object\/(sign|public|authenticated)\/([^/]+)\/(.+)$/,
      modeIndex: 1,
      bucketIndex: 2,
      pathIndex: 3,
    },
    {
      expression: /^\/storage\/v1\/render\/image\/(public|authenticated)\/([^/]+)\/(.+)$/,
      modeIndex: 1,
      bucketIndex: 2,
      pathIndex: 3,
    },
  ];

  for (const pattern of patterns) {
    const match = parsed.pathname.match(pattern.expression);
    if (!match) continue;
    return {
      host: parsed.hostname,
      mode: match[pattern.modeIndex].toUpperCase(),
      bucket: decodeURIComponent(match[pattern.bucketIndex]),
      path: decodePath(match[pattern.pathIndex]),
    };
  }

  return {
    host: parsed.hostname,
    mode: "UNRECOGNIZED_STORAGE_PATH",
    bucket: null,
    path: parsed.pathname,
  };
}

function currentSupabaseHost() {
  const source = text(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    process.env.AVANTIQO_SUPABASE_URL,
  );
  if (!source) return null;
  try {
    return new URL(source).hostname;
  } catch {
    return null;
  }
}

async function decodeImageBlob(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  let metadata = null;
  let error = null;
  try {
    metadata = await sharp(buffer, { failOn: "error" }).metadata();
  } catch (caught) {
    error = text(caught?.message || caught);
  }
  return {
    bytes: buffer.length,
    blob_type: text(blob.type) || null,
    image_decode_success: !error,
    decode_error: error,
    width: metadata?.width || null,
    height: metadata?.height || null,
    format: metadata?.format || null,
  };
}

async function downloadObject(serviceSupabase, bucket, objectPath) {
  const result = await serviceSupabase.storage.from(bucket).download(objectPath);
  if (result.error) {
    return {
      success: false,
      error: text(result.error.message || result.error),
      status_code:
        Number(result.error.statusCode || result.error.status || 0) || null,
    };
  }
  return {
    success: true,
    ...(await decodeImageBlob(result.data)),
  };
}

async function findCandidates({ serviceSupabase, buckets, expectedPath }) {
  const directory = path.posix.dirname(expectedPath);
  const prefix = directory === "." ? "" : directory;
  const basename = path.posix.basename(expectedPath);
  const candidates = [];

  for (const bucket of buckets) {
    const result = await serviceSupabase.storage.from(bucket.id).list(prefix, {
      limit: 100,
      offset: 0,
      search: basename,
      sortBy: { column: "name", order: "asc" },
    });
    if (result.error) continue;

    for (const item of list(result.data)) {
      if (text(item.name) !== basename) continue;
      const objectPath = [prefix, item.name].filter(Boolean).join("/");
      const download = await downloadObject(
        serviceSupabase,
        bucket.id,
        objectPath,
      );
      candidates.push({
        bucket: bucket.id,
        path: objectPath,
        exact_path_match: objectPath === expectedPath,
        download,
      });
    }
  }

  return candidates;
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
  process.env.CREATIVE_SOURCE_LOCATION_AUDIT_OUTPUT ||
  "/tmp/churchill-creative-source-location-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("CREATIVE_SOURCE_LOCATION_AUDIT_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { getServiceSupabase } = await import("@/lib/shared/supabase/service");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { CreativeAssetsRuntime } = await import(
  "@/lib/creative/assets/runtime/CreativeAssetsRuntime"
);

const serviceSupabase = getServiceSupabase();
const stateBefore = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});

const bucketResult = await serviceSupabase.storage.listBuckets();
if (bucketResult.error) throw bucketResult.error;
const buckets = list(bucketResult.data)
  .map((bucket) => ({
    id: text(bucket.id || bucket.name),
    name: text(bucket.name || bucket.id),
    public: bucket.public === true,
  }))
  .filter((bucket) => bucket.id)
  .sort((left, right) => left.id.localeCompare(right.id));
const bucketIds = new Set(buckets.map((bucket) => bucket.id));

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
    `CREATIVE_SOURCE_LOCATION_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (failedVideos.length !== 13) {
  throw new Error(
    `CREATIVE_SOURCE_LOCATION_FAILED_VIDEO_COUNT_INVALID:${failedVideos.length}`,
  );
}

const bindings = failedVideos.map((task) => ({
  task_id: task.id,
  execution_node_id: text(
    task.metadata?.execution_node_id || task.input?.node_id,
  ),
  asset_id: taskSourceAssetId(task),
}));
for (const binding of bindings) {
  if (!binding.asset_id) {
    throw new Error(
      `CREATIVE_SOURCE_LOCATION_ASSET_ID_REQUIRED:${binding.task_id}`,
    );
  }
}

const currentHost = currentSupabaseHost();
const assetIds = unique(bindings.map((binding) => binding.asset_id));
const assets = [];

for (const assetId of assetIds) {
  const asset = await CreativeAssetsRuntime.get(assetId);
  if (!asset || text(asset.organization_id) !== organizationId) {
    throw new Error(`CREATIVE_SOURCE_LOCATION_ASSET_NOT_FOUND:${assetId}`);
  }

  const source = assetSource(asset);
  const parsed = parseStorageUrl(source);
  const sourceBucketExists = Boolean(
    parsed?.bucket && bucketIds.has(parsed.bucket),
  );
  const directCurrent =
    parsed?.bucket && parsed?.path && sourceBucketExists
      ? await downloadObject(serviceSupabase, parsed.bucket, parsed.path)
      : null;
  const candidates =
    parsed?.path
      ? await findCandidates({
          serviceSupabase,
          buckets,
          expectedPath: parsed.path,
        })
      : [];

  assets.push({
    asset_id: assetId,
    asset_type: text(asset.asset_type || asset.type) || null,
    mime_type: text(asset.mime_type || asset.metadata?.mime_type) || null,
    source_host: parsed?.host || null,
    current_supabase_host: currentHost,
    current_host_match:
      parsed?.host && currentHost ? parsed.host === currentHost : null,
    source_mode: parsed?.mode || null,
    source_bucket: parsed?.bucket || null,
    source_path: parsed?.path || null,
    source_bucket_exists: sourceBucketExists,
    direct_current_download: directCurrent,
    candidates,
  });
}

const stateAfter = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged = JSON.stringify(stateBefore) === JSON.stringify(stateAfter);

const output = {
  contract: "CHURCHILL_CREATIVE_SOURCE_LOCATION_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  current_supabase_host: currentHost,
  buckets,
  failed_video_task_count: failedVideos.length,
  unique_source_asset_count: assetIds.length,
  bindings,
  assets,
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
console.log("READ-ONLY CREATIVE SOURCE LOCATION AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`CURRENT_SUPABASE_HOST=${currentHost || ""}`);
console.log(`CURRENT_BUCKET_COUNT=${buckets.length}`);
console.log(`CURRENT_BUCKETS=${buckets.map((bucket) => bucket.id).join(",")}`);
console.log(`FAILED_VIDEO_TASK_COUNT=${failedVideos.length}`);
console.log(`UNIQUE_SOURCE_ASSET_COUNT=${assetIds.length}`);
for (const asset of assets) {
  const candidates = asset.candidates.map((candidate) =>
    `${candidate.bucket}:${candidate.path}:${candidate.download?.success === true ? "PASS" : "FAIL"}`,
  ).join(",");
  console.log([
    "ASSET_LOCATION",
    asset.asset_id,
    `source_host=${asset.source_host || ""}`,
    `current_host_match=${asset.current_host_match === true ? "YES" : asset.current_host_match === false ? "NO" : "N/A"}`,
    `mode=${asset.source_mode || ""}`,
    `source_bucket=${asset.source_bucket || ""}`,
    `source_path=${asset.source_path || ""}`,
    `source_bucket_exists=${asset.source_bucket_exists ? "YES" : "NO"}`,
    `direct_current=${asset.direct_current_download?.success === true ? "PASS" : "FAIL"}`,
    `candidate_count=${asset.candidates.length}`,
    `candidates=${candidates}`,
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

if (!stateUnchanged) process.exitCode = 2;
