import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const EVIDENCE_PATH = "audits/results/avantiqo-image-worker-image.json";
const SOURCE_PATH = "services/avantiqo-image-engine";
const EVIDENCE_CONTRACT = "AVANTIQO_IMAGE_WORKER_IMAGE_RESULT_V3";
const EXPECTED_ENTRYPOINT = "handler_v5.py";
const EXPECTED_RUNTIME = "AVANTIQO_IMAGE_MULTI_FOUNDATION_VOLUME_QUOTA_GUARD_V1";
const RUNPOD_REGISTRY_REPOSITORY =
  "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-image-engine-dockerfile";
const RUNPOD_TAG_PATTERN = /^[a-f0-9]{9,40}$/i;

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200)}`);
  }
  return text(result.stdout);
}

function commandStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_Z_CACHE_WRAPPER_FETCH_MAIN_FAILED");
const branch = command(
  "git",
  ["branch", "--show-current"],
  "AVANTIQO_IMAGE_Z_CACHE_WRAPPER_BRANCH_READ_FAILED",
);
if (branch !== "main") {
  throw new Error(`AVANTIQO_IMAGE_Z_CACHE_WRAPPER_MAIN_REQUIRED:${branch || "DETACHED"}`);
}
const head = command(
  "git",
  ["rev-parse", "HEAD"],
  "AVANTIQO_IMAGE_Z_CACHE_WRAPPER_HEAD_READ_FAILED",
);
const originMain = command(
  "git",
  ["rev-parse", "origin/main"],
  "AVANTIQO_IMAGE_Z_CACHE_WRAPPER_ORIGIN_MAIN_READ_FAILED",
);
if (head !== originMain) {
  throw new Error(
    `AVANTIQO_IMAGE_Z_CACHE_WRAPPER_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${originMain}`,
  );
}

const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
const sourceSha = text(evidence.source_sha).toLowerCase();
const immutableImage = text(evidence.immutable_image_reference);

if (
  evidence.success !== true ||
  text(evidence.contract) !== EVIDENCE_CONTRACT ||
  evidence.source_sha_matches_trigger !== true ||
  sourceSha !== text(evidence.trigger_sha).toLowerCase() ||
  !/^[a-f0-9]{40}$/.test(sourceSha) ||
  text(evidence.entrypoint) !== EXPECTED_ENTRYPOINT ||
  text(evidence.runtime_revision) !== EXPECTED_RUNTIME ||
  !/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)
) {
  throw new Error("AVANTIQO_IMAGE_Z_CACHE_SOURCE_LOCKED_EVIDENCE_INVALID");
}

const certifiedSourceExists = commandStatus("git", ["cat-file", "-e", `${sourceSha}^{commit}`]);
if (certifiedSourceExists.status !== 0) {
  throw new Error(`AVANTIQO_IMAGE_Z_CACHE_CERTIFIED_SOURCE_COMMIT_MISSING:${sourceSha}`);
}

let registrySourceEquivalentObserved = false;
let immutableImageObserved = false;
const provenRegistryCommits = new Map();

function proveRegistryImage(imageName) {
  const prefix = `${RUNPOD_REGISTRY_REPOSITORY}:`;
  if (!imageName.startsWith(prefix)) return null;

  const tag = imageName.slice(prefix.length).toLowerCase();
  if (!RUNPOD_TAG_PATTERN.test(tag)) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_RUNPOD_TAG_INVALID:${tag || "MISSING"}`);
  }
  if (provenRegistryCommits.has(tag)) return provenRegistryCommits.get(tag);

  const resolved = command(
    "git",
    ["rev-parse", "--verify", `${tag}^{commit}`],
    `AVANTIQO_IMAGE_Z_CACHE_RUNPOD_TAG_NOT_A_UNIQUE_COMMIT:${tag}`,
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(resolved)) {
    throw new Error(`AVANTIQO_IMAGE_Z_CACHE_RUNPOD_TAG_RESOLUTION_INVALID:${tag}`);
  }

  const onMain = commandStatus("git", ["merge-base", "--is-ancestor", resolved, "origin/main"]);
  if (onMain.status !== 0) {
    throw new Error(
      `AVANTIQO_IMAGE_Z_CACHE_RUNPOD_TAG_NOT_ON_ORIGIN_MAIN:tag=${tag}:resolved=${resolved}`,
    );
  }

  const sourceDiff = commandStatus(
    "git",
    ["diff", "--quiet", sourceSha, resolved, "--", SOURCE_PATH],
  );
  if (sourceDiff.status === 1) {
    throw new Error(
      `AVANTIQO_IMAGE_Z_CACHE_RUNPOD_SOURCE_NOT_EQUIVALENT:tag=${tag}:resolved=${resolved}:certified=${sourceSha}`,
    );
  }
  if (sourceDiff.status !== 0) {
    throw new Error(
      `AVANTIQO_IMAGE_Z_CACHE_RUNPOD_SOURCE_EQUIVALENCE_CHECK_FAILED:tag=${tag}:resolved=${resolved}`,
    );
  }

  const proof = { tag, resolved };
  provenRegistryCommits.set(tag, proof);
  registrySourceEquivalentObserved = true;
  console.log(
    `AVANTIQO_IMAGE_Z_CACHE_RUNPOD_SOURCE_EQUIVALENCE_PROVEN=tag:${tag}:commit:${resolved}:certified:${sourceSha}`,
  );
  return proof;
}

function canonicalizeTemplate(template) {
  if (!template || typeof template !== "object" || Array.isArray(template)) return template;
  const imageName = text(template.imageName);
  if (imageName === immutableImage) {
    immutableImageObserved = true;
    return template;
  }
  const proof = proveRegistryImage(imageName);
  if (proof) {
    return { ...template, imageName: immutableImage };
  }
  return template;
}

function canonicalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) return endpoint;
  const template = object(endpoint.template);
  if (!Object.keys(template).length) return endpoint;
  const canonicalTemplate = canonicalizeTemplate(template);
  if (canonicalTemplate === template) return endpoint;
  return { ...endpoint, template: canonicalTemplate };
}

function canonicalizeRestBody(body, url) {
  if (url.startsWith(`${REST_BASE}/templates`)) {
    return Array.isArray(body)
      ? body.map(canonicalizeTemplate)
      : canonicalizeTemplate(body);
  }
  if (url.startsWith(`${REST_BASE}/endpoints`)) {
    return Array.isArray(body)
      ? body.map(canonicalizeEndpoint)
      : canonicalizeEndpoint(body);
  }
  return body;
}

const baseFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init = undefined) => {
  const response = await baseFetch(input, init);
  const url = typeof input === "string" ? input : text(input?.url);
  const method = text(init?.method || "GET").toUpperCase();

  if (
    method !== "GET" ||
    !response.ok ||
    (!url.startsWith(`${REST_BASE}/endpoints`) && !url.startsWith(`${REST_BASE}/templates`))
  ) {
    return response;
  }

  let body;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }

  const canonicalBody = canonicalizeRestBody(body, url);
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify(canonicalBody), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

console.log("AVANTIQO_IMAGE_Z_CACHE_SOURCE_LOCKED_WRAPPER=true");
console.log(`AVANTIQO_IMAGE_Z_CACHE_CERTIFIED_SOURCE_SHA=${sourceSha}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_CERTIFIED_IMMUTABLE_IMAGE=${immutableImage}`);
console.log(`AVANTIQO_IMAGE_Z_CACHE_RUNPOD_REGISTRY_REPOSITORY=${RUNPOD_REGISTRY_REPOSITORY}`);
console.log(
  "AVANTIQO_IMAGE_Z_CACHE_SOURCE_EQUIVALENCE_RULE=EXACT_RUNPOD_REPOSITORY_PLUS_GIT_COMMIT_ON_ORIGIN_MAIN_PLUS_ZERO_IMAGE_ENGINE_DIFF",
);
console.log("AVANTIQO_IMAGE_Z_CACHE_ARBITRARY_RUNPOD_TAG_ALLOWED=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_OTHER_IMAGE_REPOSITORIES_ALLOWED=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_WRAPPER_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_WRAPPER_GENERATION=false");
console.log("AVANTIQO_IMAGE_Z_CACHE_WRAPPER_PRODUCTION_DEPLOY=false");

await import("./cache-avantiqo-image-z-image-once-local.mjs");

if (!registrySourceEquivalentObserved && !immutableImageObserved) {
  throw new Error("AVANTIQO_IMAGE_Z_CACHE_CERTIFIED_BINDING_NOT_OBSERVED");
}
console.log(
  `AVANTIQO_IMAGE_Z_CACHE_BINDING_PROVENANCE=${
    registrySourceEquivalentObserved
      ? "RUNPOD_REGISTRY_GIT_PROVEN_SOURCE_EQUIVALENT"
      : "GHCR_IMMUTABLE_DIGEST"
  }`,
);
if (registrySourceEquivalentObserved) {
  console.log(
    `AVANTIQO_IMAGE_Z_CACHE_PROVEN_RUNPOD_COMMITS=${JSON.stringify([...provenRegistryCommits.values()])}`,
  );
}
