import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const REGISTRY_AUTH_NAME = "avantiqo-ghcr";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-audio-worker-image.json";
const CONTRACT = "AVANTIQO_RUNPOD_GHCR_AUTH_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 3) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = value[key];
    if (Array.isArray(nested)) return nested;
    const normalized = normalizeListResponse(nested, candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

function looksLikeRegistryAuthRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && text(value.id));
}

function normalizeRegistryAuthResponse(value) {
  const preferred = normalizeListResponse(value, [
    "containerRegistryAuths",
    "containerRegistryCreds",
    "registryAuths",
    "registryCredentials",
    "credentials",
    "auths",
  ]);
  if (preferred) return preferred;

  const records = [];
  const seen = new Set();
  function visit(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 8 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (looksLikeRegistryAuthRecord(node)) records.push(node);
    for (const nested of Object.values(node)) visit(nested, depth + 1);
  }
  visit(value);
  return records;
}

async function runpod(pathname, managementKey, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 400);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

function resolveExistingAuth(registryAuths) {
  const explicitId = text(process.env.AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID);
  if (explicitId) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicitId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_ID_NOT_FOUND:matches=${matches.length}`);
    }
    return { auth: matches[0], resolution: "EXPLICIT_ID" };
  }

  const exact = registryAuths.filter((item) => text(item?.name) === REGISTRY_AUTH_NAME);
  if (exact.length === 1) return { auth: exact[0], resolution: "CANONICAL_NAME" };
  if (exact.length > 1) {
    throw new Error(`AVANTIQO_RUNPOD_GHCR_AUTH_CANONICAL_NAME_AMBIGUOUS:matches=${exact.length}`);
  }

  const candidates = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (candidates.length === 1) return { auth: candidates[0], resolution: "GHCR_NAME_MATCH" };
  if (candidates.length > 1) {
    throw new Error(`AVANTIQO_RUNPOD_GHCR_AUTH_AMBIGUOUS:matches=${candidates.length}`);
  }
  return { auth: null, resolution: "MISSING" };
}

function runGh(args, errorCode, secret = false) {
  const result = spawnSync("gh", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = secret ? "COMMAND_FAILED" : text(result.stderr || result.stdout).slice(0, 300);
    throw new Error(`${errorCode}:${detail || `exit=${result.status}`}`);
  }
  const output = text(result.stdout);
  if (!output) throw new Error(`${errorCode}:EMPTY_OUTPUT`);
  return output;
}

async function immutableAudioImage() {
  const parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  if (
    parsed?.success !== true ||
    parsed?.contract !== "AVANTIQO_AUDIO_WORKER_IMAGE_RESULT_V2" ||
    parsed?.source_sha_matches_trigger !== true ||
    text(parsed?.source_sha) !== text(parsed?.trigger_sha)
  ) {
    throw new Error("AVANTIQO_AUDIO_IMMUTABLE_WORKER_IMAGE_EVIDENCE_INVALID");
  }
  const reference = text(parsed?.immutable_image_reference);
  const match = reference.match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) throw new Error("AVANTIQO_AUDIO_IMMUTABLE_GHCR_REFERENCE_REQUIRED");
  return { reference, repository: match[1], digest: match[2] };
}

async function proveGhcrPull(username, githubToken, image) {
  const tokenUrl = new URL("https://ghcr.io/token");
  tokenUrl.searchParams.set("service", "ghcr.io");
  tokenUrl.searchParams.set("scope", `repository:${image.repository}:pull`);
  const basic = Buffer.from(`${username}:${githubToken}`, "utf8").toString("base64");
  const tokenResponse = await fetch(tokenUrl, {
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const tokenBody = object(await tokenResponse.json().catch(() => ({})));
  if (!tokenResponse.ok) {
    throw new Error(`AVANTIQO_GHCR_PULL_TOKEN_REJECTED:status=${tokenResponse.status}`);
  }
  const registryToken = text(tokenBody.token || tokenBody.access_token);
  if (!registryToken) throw new Error("AVANTIQO_GHCR_PULL_TOKEN_MISSING");

  const manifestResponse = await fetch(
    `https://ghcr.io/v2/${image.repository}/manifests/${encodeURIComponent(image.digest)}`,
    {
      headers: {
        Authorization: `Bearer ${registryToken}`,
        Accept: [
          "application/vnd.oci.image.index.v1+json",
          "application/vnd.oci.image.manifest.v1+json",
          "application/vnd.docker.distribution.manifest.list.v2+json",
          "application/vnd.docker.distribution.manifest.v2+json",
        ].join(", "),
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!manifestResponse.ok) {
    throw new Error(`AVANTIQO_GHCR_IMMUTABLE_PULL_PROOF_FAILED:status=${manifestResponse.status}`);
  }
  const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
  await manifestResponse.arrayBuffer();
  if (contentDigest && contentDigest.toLowerCase() !== image.digest.toLowerCase()) {
    throw new Error("AVANTIQO_GHCR_IMMUTABLE_PULL_DIGEST_MISMATCH");
  }
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const image = await immutableAudioImage();
const registryAuths = normalizeRegistryAuthResponse(await runpod("/containerregistryauth", managementKey));
const existing = resolveExistingAuth(registryAuths);

const baseResult = {
  success: Boolean(existing.auth),
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  canonical_registry_auth_name: REGISTRY_AUTH_NAME,
  registry_auth_exists: Boolean(existing.auth),
  registry_auth_resolution: existing.resolution,
  immutable_audio_image: image.reference,
  ghcr_pull_proof_performed: false,
  ghcr_pull_proof_passed: false,
  runpod_registry_auth_created: false,
  runpod_mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secret_values_printed: false,
  next_action: existing.auth ? "REUSE_EXISTING_RUNPOD_GHCR_AUTH" : "CREATE_RUNPOD_GHCR_AUTH_FROM_LOCAL_GH",
};

if (existing.auth) {
  console.log("AVANTIQO_RUNPOD_GHCR_AUTH=EXISTS");
  console.log(JSON.stringify(baseResult, null, 2));
  process.exit(0);
}

if (!apply) {
  console.log("AVANTIQO_RUNPOD_GHCR_AUTH=MISSING");
  console.log(JSON.stringify(baseResult, null, 2));
  process.exit(0);
}

if (text(process.env.AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_AUDIO_RUNPOD_REGISTRY_AUTH_APPROVED=YES_REQUIRED");
}

const username = runGh(["api", "user", "--jq", ".login"], "AVANTIQO_LOCAL_GH_LOGIN_REQUIRED");
const githubToken = runGh(["auth", "token", "-h", "github.com"], "AVANTIQO_LOCAL_GH_TOKEN_REQUIRED", true);
await proveGhcrPull(username, githubToken, image);

const created = object(
  await runpod("/containerregistryauth", managementKey, {
    method: "POST",
    body: {
      name: REGISTRY_AUTH_NAME,
      username,
      password: githubToken,
    },
  }),
);
const createdId = text(created.id);
if (!createdId) throw new Error("AVANTIQO_RUNPOD_GHCR_AUTH_CREATE_ID_MISSING");

const verifyAuths = normalizeRegistryAuthResponse(await runpod("/containerregistryauth", managementKey));
const verified = verifyAuths.filter((item) => text(item?.id) === createdId);
if (verified.length !== 1) {
  throw new Error(`AVANTIQO_RUNPOD_GHCR_AUTH_VERIFY_FAILED:matches=${verified.length}`);
}

console.log("AVANTIQO_RUNPOD_GHCR_AUTH=CREATED");
console.log(
  JSON.stringify(
    {
      ...baseResult,
      success: true,
      registry_auth_exists: true,
      registry_auth_resolution: "CREATED_CANONICAL_NAME",
      ghcr_pull_proof_performed: true,
      ghcr_pull_proof_passed: true,
      runpod_registry_auth_created: true,
      runpod_mutation_performed: true,
      next_action: "REPLAN_AUDIO_WORKER_REPAIR",
    },
    null,
    2,
  ),
);
