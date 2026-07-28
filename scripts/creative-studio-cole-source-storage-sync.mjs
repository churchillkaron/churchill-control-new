#!/usr/bin/env node

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";

import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function csv(value) {
  return text(value).split(",").map(text).filter(Boolean);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeName(value) {
  return path.basename(text(value)).normalize("NFKC").toLowerCase();
}

function safeSegment(value, fallback = "source") {
  return text(value)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 120) || fallback;
}

function mimeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".mov": return "video/quicktime";
    case ".mp4": return "video/mp4";
    case ".webm": return "video/webm";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    default: return "application/octet-stream";
  }
}

function mediaKind(mime) {
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  return "file";
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function checksumForNode(node) {
  const technical = object(node?.technical);
  const metadata = object(node?.metadata);
  return text(
    technical.checksum_sha256 ||
    technical.checksum ||
    metadata.checksum_sha256 ||
    metadata.checksum,
  ).toLowerCase();
}

function namesForNode(node) {
  const technical = object(node?.technical);
  const metadata = object(node?.metadata);
  return [
    technical.original_file_name,
    metadata.original_file_name,
    node?.name,
  ].map(normalizeName).filter(Boolean);
}

function parseStorageReference(node, fallbackBucket) {
  const url = text(node?.url);
  if (url.startsWith("storage://")) {
    const remainder = url.slice("storage://".length);
    const separator = remainder.indexOf("/");
    if (separator > 0 && separator < remainder.length - 1) {
      return {
        bucket: remainder.slice(0, separator),
        storagePath: remainder.slice(separator + 1),
      };
    }
  }

  const metadata = object(node?.metadata);
  const storagePath = text(node?.storage_path || metadata.storage_path);
  const bucket = text(metadata.storage_bucket || fallbackBucket);
  if (!storagePath || !bucket) return null;
  return { bucket, storagePath };
}

async function signedRangeReadable(supabase, bucket, storagePath) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 10 * 60);

  if (error || !data?.signedUrl) {
    return {
      readable: false,
      reason: error?.message || "signed URL missing",
    };
  }

  const response = await fetch(data.signedUrl, {
    method: "GET",
    headers: {
      Range: "bytes=0-0",
    },
  });

  const readable = response.status === 200 || response.status === 206;
  if (response.body) {
    try {
      const reader = response.body.getReader();
      await reader.read();
      await reader.cancel();
    } catch {
      // The HTTP status is the authoritative remote-read proof.
    }
  }

  return {
    readable,
    status: response.status,
    reason: readable ? null : `HTTP ${response.status}`,
  };
}

async function exactCount(supabase, table, configure = (query) => query) {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true });
  query = configure(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return Number(count || 0);
}

const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
const projectId = required("COLE_LEY_PROJECT_ID");
const missionId = text(process.env.COLE_LEY_MISSION_ID) || null;
const fallbackBucket = required("CREATIVE_MEDIA_ASSET_BUCKET");
const videoFiles = csv(required("COLE_LEY_VIDEO_FILES"));
const logoFile = required("COLE_LEY_LOGO_FILE");
const sourcePaths = [...videoFiles, logoFile];

if (videoFiles.length !== 8) {
  throw new Error(`COLE_LEY_VIDEO_FILES expected 8 files, received ${videoFiles.length}`);
}
if (sourcePaths.length !== 9) {
  throw new Error(`Cole source set expected 9 files, received ${sourcePaths.length}`);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

const localSources = [];
for (const filePath of sourcePaths) {
  const absolutePath = path.resolve(filePath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`Source file invalid: ${absolutePath}`);
  }
  localSources.push({
    absolutePath,
    fileName: path.basename(absolutePath),
    normalizedName: normalizeName(absolutePath),
    sizeBytes: stat.size,
    checksumSha256: await sha256File(absolutePath),
    mimeType: mimeFor(absolutePath),
    mediaKind: mediaKind(mimeFor(absolutePath)),
    expectedType: absolutePath === path.resolve(logoFile) ? "LOGO" : "VIDEO",
  });
}

const { data: nodes, error: nodesError } = await supabase
  .from("creative_asset_nodes")
  .select("*")
  .eq("organization_id", organizationId)
  .eq("creative_project_id", projectId)
  .neq("status", "ARCHIVED");

if (nodesError) throw nodesError;

const originalNodes = (nodes || []).filter((node) =>
  !node.parent_asset_node_id &&
  ["VIDEO", "LOGO", "IMAGE", "ASSET"].includes(text(node.type).toUpperCase())
);

const before = {
  jobs: await exactCount(
    supabase,
    "creative_execution_jobs",
    (query) => query.eq("creative_project_id", projectId),
  ),
  steps: await exactCount(
    supabase,
    "creative_execution_steps",
    (query) => query.eq("creative_project_id", projectId),
  ),
  usage: await exactCount(
    supabase,
    "platform_service_usage",
    (query) => query.eq("organization_id", organizationId),
  ),
  wallet: await exactCount(
    supabase,
    "wallet_transactions",
    (query) => query.eq("organization_id", organizationId),
  ),
};

let confirmedCount = 0;
let uploadedCount = 0;
let referenceRepairCount = 0;
let nodeMutationCount = 0;
let assetMutationCount = 0;
const matchedNodeIds = new Set();

for (const source of localSources) {
  const checksumMatches = originalNodes.filter((node) =>
    checksumForNode(node) === source.checksumSha256.toLowerCase()
  );

  const nameMatches = originalNodes.filter((node) =>
    namesForNode(node).includes(source.normalizedName) &&
    (
      source.expectedType === "VIDEO"
        ? text(node.type).toUpperCase() === "VIDEO"
        : ["LOGO", "IMAGE"].includes(text(node.type).toUpperCase())
    )
  );

  const candidates = checksumMatches.length ? checksumMatches : nameMatches;
  if (candidates.length !== 1) {
    throw new Error(
      `SOURCE_NODE_MATCH_INVALID:${source.fileName}:matches=${candidates.length}`,
    );
  }

  const node = candidates[0];
  if (matchedNodeIds.has(node.id)) {
    throw new Error(`SOURCE_NODE_REUSED:${source.fileName}:${node.id}`);
  }
  matchedNodeIds.add(node.id);

  const recordedChecksum = checksumForNode(node);
  if (recordedChecksum && recordedChecksum !== source.checksumSha256.toLowerCase()) {
    throw new Error(
      `SOURCE_CHECKSUM_MISMATCH:${source.fileName}:${recordedChecksum}:${source.checksumSha256}`,
    );
  }

  let storage = parseStorageReference(node, fallbackBucket);
  let remote = storage
    ? await signedRangeReadable(supabase, storage.bucket, storage.storagePath)
    : { readable: false, reason: "storage reference missing" };

  let moved = false;
  if (!remote.readable) {
    const extension = path.extname(source.fileName).toLowerCase();
    const base = safeSegment(path.basename(source.fileName, extension), "source");
    const storagePath = [
      organizationId,
      projectId,
      "source-originals",
      `${source.checksumSha256}-${base}${extension}`,
    ].join("/");

    const bytes = await fs.readFile(source.absolutePath);
    if (bytes.length !== source.sizeBytes) {
      throw new Error(`SOURCE_SIZE_CHANGED_DURING_SYNC:${source.fileName}`);
    }
    const uploadHash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (uploadHash !== source.checksumSha256) {
      throw new Error(`SOURCE_CHECKSUM_CHANGED_DURING_SYNC:${source.fileName}`);
    }

    const { error: uploadError } = await supabase.storage
      .from(fallbackBucket)
      .upload(storagePath, bytes, {
        contentType: source.mimeType,
        cacheControl: "3600",
        upsert: true,
        metadata: {
          organization_id: organizationId,
          creative_project_id: projectId,
          creative_mission_id: missionId || "",
          original_file_name: source.fileName,
          checksum_sha256: source.checksumSha256,
          source_role: source.expectedType === "LOGO" ? "brand_logo" : "original_video",
        },
      });

    if (uploadError) {
      throw new Error(`SOURCE_STORAGE_UPLOAD_FAILED:${source.fileName}:${uploadError.message}`);
    }

    storage = {
      bucket: fallbackBucket,
      storagePath,
    };
    remote = await signedRangeReadable(supabase, storage.bucket, storage.storagePath);
    if (!remote.readable) {
      throw new Error(
        `SOURCE_STORAGE_REMOTE_READ_FAILED:${source.fileName}:${remote.reason || remote.status}`,
      );
    }
    moved = true;
    uploadedCount += 1;
  }

  if (!storage.storagePath.startsWith(`${organizationId}/`)) {
    throw new Error(`SOURCE_STORAGE_ORGANIZATION_SCOPE_INVALID:${source.fileName}`);
  }

  const desiredUrl = `storage://${storage.bucket}/${storage.storagePath}`;
  const currentMetadata = object(node.metadata);
  const currentTechnical = object(node.technical);
  const referencesRequireRepair =
    text(node.url) !== desiredUrl ||
    text(node.storage_path) !== storage.storagePath ||
    text(currentMetadata.storage_bucket) !== storage.bucket ||
    text(currentMetadata.storage_path) !== storage.storagePath ||
    text(currentMetadata.checksum_sha256).toLowerCase() !== source.checksumSha256.toLowerCase() ||
    text(currentTechnical.checksum_sha256).toLowerCase() !== source.checksumSha256.toLowerCase();

  if (referencesRequireRepair) {
    const syncedAt = new Date().toISOString();
    const nodePatch = {
      url: desiredUrl,
      storage_path: storage.storagePath,
      technical: {
        ...currentTechnical,
        media_kind: source.mediaKind,
        mime_type: source.mimeType,
        file_size_bytes: source.sizeBytes,
        original_file_name: source.fileName,
        checksum: source.checksumSha256,
        checksum_sha256: source.checksumSha256,
      },
      metadata: {
        ...currentMetadata,
        storage_bucket: storage.bucket,
        storage_path: storage.storagePath,
        signed_url_required: true,
        original_file_name: source.fileName,
        mime_type: source.mimeType,
        media_kind: source.mediaKind,
        size_bytes: source.sizeBytes,
        checksum_sha256: source.checksumSha256,
        source_storage_synced_at: syncedAt,
        source_storage_sync_mode: moved ? "OBJECT_UPLOADED" : "REFERENCE_REPAIRED",
      },
      updated_at: syncedAt,
    };

    const { error: nodeUpdateError } = await supabase
      .from("creative_asset_nodes")
      .update(nodePatch)
      .eq("id", node.id)
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId);

    if (nodeUpdateError) {
      throw new Error(`SOURCE_NODE_UPDATE_FAILED:${source.fileName}:${nodeUpdateError.message}`);
    }
    nodeMutationCount += 1;
    referenceRepairCount += 1;

    if (node.creative_asset_id) {
      const { data: asset, error: assetReadError } = await supabase
        .from("creative_assets")
        .select("id,metadata")
        .eq("id", node.creative_asset_id)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (assetReadError) {
        throw new Error(`SOURCE_ASSET_READ_FAILED:${source.fileName}:${assetReadError.message}`);
      }
      if (!asset) {
        throw new Error(`SOURCE_ASSET_MISSING:${source.fileName}:${node.creative_asset_id}`);
      }

      const { error: assetUpdateError } = await supabase
        .from("creative_assets")
        .update({
          image_url: desiredUrl,
          file_url: desiredUrl,
          metadata: {
            ...object(asset.metadata),
            creative_project_id: projectId,
            storage_bucket: storage.bucket,
            storage_path: storage.storagePath,
            signed_url_required: true,
            original_file_name: source.fileName,
            mime_type: source.mimeType,
            media_kind: source.mediaKind,
            size_bytes: source.sizeBytes,
            checksum_sha256: source.checksumSha256,
            source_storage_synced_at: syncedAt,
          },
        })
        .eq("id", node.creative_asset_id)
        .eq("organization_id", organizationId);

      if (assetUpdateError) {
        throw new Error(`SOURCE_ASSET_UPDATE_FAILED:${source.fileName}:${assetUpdateError.message}`);
      }
      assetMutationCount += 1;
    }
  }

  confirmedCount += 1;
  console.log(
    [
      `SOURCE=${source.fileName}`,
      `TYPE=${source.expectedType}`,
      `NODE_ID=${node.id}`,
      `CHECKSUM=${source.checksumSha256}`,
      `SIZE_BYTES=${source.sizeBytes}`,
      `BUCKET=${storage.bucket}`,
      `STORAGE_PATH=${storage.storagePath}`,
      `REMOTE_READ=PASS`,
      `ACTION=${moved ? "UPLOADED_MISSING_ORIGINAL" : referencesRequireRepair ? "REFERENCE_REPAIRED" : "CONFIRMED_EXISTING"}`,
    ].join(" "),
  );
}

if (confirmedCount !== 9 || matchedNodeIds.size !== 9) {
  throw new Error(
    `SOURCE_SET_INCOMPLETE:confirmed=${confirmedCount}:nodes=${matchedNodeIds.size}`,
  );
}

const after = {
  jobs: await exactCount(
    supabase,
    "creative_execution_jobs",
    (query) => query.eq("creative_project_id", projectId),
  ),
  steps: await exactCount(
    supabase,
    "creative_execution_steps",
    (query) => query.eq("creative_project_id", projectId),
  ),
  usage: await exactCount(
    supabase,
    "platform_service_usage",
    (query) => query.eq("organization_id", organizationId),
  ),
  wallet: await exactCount(
    supabase,
    "wallet_transactions",
    (query) => query.eq("organization_id", organizationId),
  ),
};

for (const key of ["jobs", "steps", "usage", "wallet"]) {
  if (before[key] !== after[key]) {
    throw new Error(
      `UNEXPECTED_${key.toUpperCase()}_COUNT_CHANGE:${before[key]}:${after[key]}`,
    );
  }
}

console.log(`SOURCE_TOTAL=${confirmedCount}`);
console.log(`SOURCE_VIDEO_COUNT=${videoFiles.length}`);
console.log("SOURCE_LOGO_COUNT=1");
console.log(`SOURCE_OBJECT_UPLOAD_COUNT=${uploadedCount}`);
console.log(`SOURCE_REFERENCE_REPAIR_COUNT=${referenceRepairCount}`);
console.log(`SOURCE_NODE_MUTATION_COUNT=${nodeMutationCount}`);
console.log(`SOURCE_ASSET_MUTATION_COUNT=${assetMutationCount}`);
console.log("SOURCE_CHECKSUMS=PASS");
console.log("REMOTE_PRIVATE_STORAGE_ACCESS=PASS");
console.log("CREATIVE_EXECUTION_JOB_COUNT_UNCHANGED=PASS");
console.log("CREATIVE_EXECUTION_STEP_COUNT_UNCHANGED=PASS");
console.log("USAGE_ROW_COUNT_UNCHANGED=PASS");
console.log("WALLET_ROW_COUNT_UNCHANGED=PASS");
console.log("ASSET_ANALYSIS_CALLED=NO");
console.log("WORKER_CALLED=NO");
console.log("AI_PROVIDER_CALLS=NO");
console.log("VIDEO_PROVIDER_CALLS=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PRODUCTION_STARTED=NO");
