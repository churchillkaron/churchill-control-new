#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { spawnSync } from "node:child_process";
import WebSocket from "ws";

import {
  createClient,
} from "@supabase/supabase-js";

globalThis.WebSocket = WebSocket;

const ENV_FILES = [".env", ".env.local"];
const TARGET_ENV_FILE = ".env.local";

const ASSET_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/octet-stream",
]);

const VIDEO_MIME_TYPES = Object.freeze([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/json",
  "application/octet-stream",
]);

function text(value) {
  return String(value ?? "").trim();
}

function positiveInteger(value, fallback = null) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
    const separator = normalized.indexOf("=");
    if (separator < 1) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }

  return values;
}

function loadedEnvironment() {
  const values = {};
  for (const filePath of ENV_FILES) {
    Object.assign(values, parseEnvFile(filePath));
  }
  return { ...values, ...process.env };
}

function executable(name, configured = null) {
  const explicit = text(configured);
  if (explicit && fs.existsSync(explicit)) return explicit;
  const resolved = spawnSync("sh", ["-lc", `command -v ${name}`], {
    encoding: "utf8",
  });
  return resolved.status === 0 ? text(resolved.stdout) : null;
}

function updateEnvFile(filePath, updates) {
  const current = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
  const lines = current.split(/\r?\n/);
  const remaining = new Map(Object.entries(updates));
  const next = lines.map((line) => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
    if (!match || !remaining.has(match[1])) return line;
    const value = remaining.get(match[1]);
    remaining.delete(match[1]);
    return `${match[1]}=${value}`;
  });

  if (remaining.size) {
    if (next.length && next[next.length - 1] !== "") next.push("");
    next.push("# Avantiqo Creative private media runtime");
    for (const [key, value] of remaining.entries()) {
      next.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(filePath, `${next.join("\n").replace(/\n+$/, "")}\n`, {
    mode: 0o600,
  });
}

function bucketOptions({ fileSizeLimit, allowedMimeTypes }) {
  const options = {
    public: false,
    allowedMimeTypes,
  };
  if (fileSizeLimit) options.fileSizeLimit = fileSizeLimit;
  return options;
}

async function ensurePrivateBucket(supabase, definition) {
  const { id, fileSizeLimit, allowedMimeTypes } = definition;
  const options = bucketOptions({ fileSizeLimit, allowedMimeTypes });
  const { data: existing, error: lookupError } = await supabase.storage.getBucket(id);
  if (lookupError && !/not found/i.test(lookupError.message || "")) {
    throw new Error(`Bucket ${id} lookup failed: ${lookupError.message}`);
  }

  if (!existing?.id) {
    const { error } = await supabase.storage.createBucket(id, options);
    if (error) {
      throw new Error(
        `Bucket ${id} creation failed for fileSizeLimit=${fileSizeLimit || "GLOBAL"}: ${error.message}`,
      );
    }
    return {
      id,
      created: true,
      private: true,
      fileSizeLimit,
      allowedMimeTypes,
    };
  }

  const { error } = await supabase.storage.updateBucket(id, options);
  if (error) {
    const globalHint = /maximum|limit|size/i.test(error.message || "")
      ? " Supabase Storage global file-size limit may be lower than this bucket limit."
      : "";
    throw new Error(
      `Bucket ${id} update failed for fileSizeLimit=${fileSizeLimit || "GLOBAL"}: ${error.message}.${globalHint}`,
    );
  }

  const { data: verified, error: verifyError } = await supabase.storage.getBucket(id);
  if (verifyError) {
    throw new Error(`Bucket ${id} verification failed: ${verifyError.message}`);
  }
  if (verified?.public !== false) {
    throw new Error(`Bucket ${id} did not remain private`);
  }

  const verifiedLimit = positiveInteger(
    verified?.file_size_limit ?? verified?.fileSizeLimit,
    null,
  );
  if (fileSizeLimit && verifiedLimit !== fileSizeLimit) {
    throw new Error(
      `Bucket ${id} file-size limit verification failed: requested=${fileSizeLimit} actual=${verifiedLimit || "GLOBAL"}`,
    );
  }

  return {
    id,
    created: false,
    private: true,
    fileSizeLimit: verifiedLimit,
    allowedMimeTypes:
      verified?.allowed_mime_types ||
      verified?.allowedMimeTypes ||
      allowedMimeTypes,
  };
}

async function main() {
  const env = loadedEnvironment();
  const supabaseUrl = text(
    env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
  );
  const serviceRoleKey = text(
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_ADMIN_KEY,
  );

  if (!supabaseUrl) throw new Error("Supabase URL is required");
  if (!serviceRoleKey) throw new Error("Supabase service-role key is required");

  const ffmpegPath = executable("ffmpeg", env.CREATIVE_MEDIA_FFMPEG_PATH);
  const ffprobePath = executable("ffprobe", env.CREATIVE_MEDIA_FFPROBE_PATH);
  if (!ffmpegPath) throw new Error("ffmpeg executable was not found");
  if (!ffprobePath) throw new Error("ffprobe executable was not found");

  const buckets = {
    asset: text(env.CREATIVE_MEDIA_ASSET_BUCKET) || "creative-assets",
    render: text(env.CREATIVE_MEDIA_RENDER_BUCKET) || "creative-renders",
    derivative:
      text(env.CREATIVE_MEDIA_DERIVATIVE_BUCKET) || "creative-derivatives",
  };

  if (buckets.asset === buckets.render) {
    throw new Error("Creative asset and render buckets must be distinct");
  }

  const assetLimit = positiveInteger(
    env.CREATIVE_MEDIA_ASSET_MAX_UPLOAD_BYTES ||
    env.CREATIVE_ASSET_MAX_UPLOAD_BYTES,
    null,
  );
  const renderLimit = positiveInteger(
    env.CREATIVE_MEDIA_RENDER_MAX_UPLOAD_BYTES,
    assetLimit,
  );
  const derivativeLimit = positiveInteger(
    env.CREATIVE_MEDIA_DERIVATIVE_MAX_UPLOAD_BYTES,
    assetLimit,
  );

  const definitions = [
    {
      id: buckets.asset,
      fileSizeLimit: assetLimit,
      allowedMimeTypes: ASSET_MIME_TYPES,
    },
    {
      id: buckets.render,
      fileSizeLimit: renderLimit,
      allowedMimeTypes: VIDEO_MIME_TYPES,
    },
    {
      id: buckets.derivative,
      fileSizeLimit: derivativeLimit,
      allowedMimeTypes: VIDEO_MIME_TYPES,
    },
  ];

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const results = [];
  for (const definition of definitions) {
    if (results.some((entry) => entry.id === definition.id)) continue;
    results.push(await ensurePrivateBucket(supabase, definition));
  }

  const envUpdates = {
    CREATIVE_MEDIA_ASSET_BUCKET: buckets.asset,
    CREATIVE_MEDIA_RENDER_BUCKET: buckets.render,
    CREATIVE_MEDIA_DERIVATIVE_BUCKET: buckets.derivative,
    CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS:
      text(env.CREATIVE_PRIVATE_MEDIA_URL_TTL_SECONDS) || "3600",
    CREATIVE_MEDIA_FFMPEG_PATH: ffmpegPath,
    CREATIVE_MEDIA_FFPROBE_PATH: ffprobePath,
    CREATIVE_MEDIA_RENDER_TIMEOUT_MS:
      text(env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS) || "7200000",
    CREATIVE_MEDIA_DERIVATIVE_TIMEOUT_MS:
      text(env.CREATIVE_MEDIA_DERIVATIVE_TIMEOUT_MS) || "3600000",
    CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS:
      text(env.CREATIVE_MEDIA_TEMPORAL_TIMEOUT_MS) || "3600000",
    CREATIVE_MEDIA_SCENE_THRESHOLD:
      text(env.CREATIVE_MEDIA_SCENE_THRESHOLD) || "0.3",
    CREATIVE_MEDIA_RENDER_CACHE_CONTROL:
      text(env.CREATIVE_MEDIA_RENDER_CACHE_CONTROL) || "3600",
  };
  if (assetLimit) {
    envUpdates.CREATIVE_MEDIA_ASSET_MAX_UPLOAD_BYTES = String(assetLimit);
    envUpdates.CREATIVE_ASSET_MAX_UPLOAD_BYTES = String(assetLimit);
  }
  if (renderLimit) {
    envUpdates.CREATIVE_MEDIA_RENDER_MAX_UPLOAD_BYTES = String(renderLimit);
  }
  if (derivativeLimit) {
    envUpdates.CREATIVE_MEDIA_DERIVATIVE_MAX_UPLOAD_BYTES = String(derivativeLimit);
  }
  updateEnvFile(TARGET_ENV_FILE, envUpdates);

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE STORAGE BOOTSTRAP");
  console.log("============================================================");
  for (const result of results) {
    console.log(
      [
        `BUCKET=${result.id}`,
        "PRIVATE=YES",
        `CREATED=${result.created ? "YES" : "NO"}`,
        `MAX_BYTES=${result.fileSizeLimit || "GLOBAL"}`,
      ].join(" "),
    );
  }
  console.log(`FFMPEG=${ffmpegPath}`);
  console.log(`FFPROBE=${ffprobePath}`);
  console.log(`ENV_FILE=${TARGET_ENV_FILE}`);
  console.log("CREATIVE_STORAGE_BOOTSTRAP=PASS");
}

main().catch((error) => {
  console.error("CREATIVE_STORAGE_BOOTSTRAP=FAIL");
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
