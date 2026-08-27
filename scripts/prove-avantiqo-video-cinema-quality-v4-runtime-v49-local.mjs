import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const BASE = "scripts/prove-avantiqo-video-cinema-quality-v4-runtime-v48-local.mjs";

function replaceExactlyOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) {
    throw new Error(`AVANTIQO_VIDEO_V49_SOURCE_TRANSFORM_${label}_MISMATCH:occurrences=${count}`);
  }
  return source.replace(search, replacement);
}

const major = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(major) || major < 20) {
  throw new Error(`AVANTIQO_VIDEO_V49_NODE20_REQUIRED:${process.version}`);
}

let source = await readFile(resolve(process.cwd(), BASE), "utf8");

source = replaceExactlyOnce(
  source,
  'let source = await readFile(resolve(process.cwd(), BASE), "utf8");',
  `let source = await readFile(resolve(process.cwd(), BASE), "utf8");
source = replaceExactlyOnce(
  source,
  'const ALLOCATION_LIMIT_MS = 40_000;\\nconst COMPLETION_LIMIT_MS = 120_000;\\nconst POLL_MS = 2_000;\\nconst LEASE_TTL_MS = 240_000;',
  'const ALLOCATION_LIMIT_MS = 180_000;\\nconst COMPLETION_LIMIT_MS = 180_000;\\nconst POLL_MS = 2_000;\\nconst LEASE_TTL_MS = 420_000;',
  "COLD_START_WINDOWS",
);`,
  "INJECT_COLD_START_WINDOWS",
);

source = source.replaceAll("V48", "V49");
if (source.includes("V48")) {
  throw new Error("AVANTIQO_VIDEO_V49_SOURCE_TRANSFORM_V48_REMAINS");
}

console.log(`AVANTIQO_VIDEO_V49_SOURCE_TRANSFORM_ACTIVE=${JSON.stringify({
  base: BASE,
  node: process.version,
  repair: "ALLOW_FIRST_BOOT_IMMUTABLE_V4_IMAGE_COLD_PULL_AND_STARTUP",
  allocation_limit_ms: 180000,
  runtime_probe_completion_limit_ms: 180000,
  lease_ttl_ms: 420000,
  inference_requested: false,
  generation_requested: false,
  model_download_requested: false,
  storage_mutation_requested: false,
  safe_lease_changed: false,
  gpu_pool_changed: false,
  video_runtime_changed: false,
  image_endpoint_changed: false,
})}`);

const encoded = Buffer.from(source, "utf8").toString("base64");
await import(`data:text/javascript;base64,${encoded}`);
