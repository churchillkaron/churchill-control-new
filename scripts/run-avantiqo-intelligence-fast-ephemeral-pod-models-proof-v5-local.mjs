import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V5";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V5_APPROVED";
const SOURCE_PATH = "scripts/run-avantiqo-intelligence-fast-ephemeral-pod-models-proof-v5-local.mjs";
const V3_APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V3_APPROVED";
const V3_PATH = "./run-avantiqo-intelligence-fast-ephemeral-pod-models-proof-v3-local.mjs";
const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const PUBLIC_REPOSITORY = "runpod/worker-v1-vllm";
const PUBLIC_TAG = "v2.25.0";
const PUBLIC_TAG_REFERENCE = `${PUBLIC_REPOSITORY}:${PUBLIC_TAG}`;
const DOCKER_AUTH = "https://auth.docker.io/token";
const DOCKER_REGISTRY = "https://registry-1.docker.io";
const MAX_RUNTIME_BOOT_SPEND_USD = 0.12;
const MAX_RUNTIME_BOOT_WALL_MS = 120_000;

const text = (v) => String(v ?? "").trim();
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const yes = (v) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(v).toUpperCase());

function redact(v) {
  return text(v).slice(0, 3000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code, { allowFailure = false } = {}) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (allowFailure) return result;
  if (result.signal) throw new Error(`${code}_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${code}_RC:${result.status}:${redact(result.stderr || result.stdout)}`);
  return text(result.stdout);
}

function sourceGate() {
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_FETCH_FAILED`);
  const origin = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_FAILED`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_HEAD_FAILED`);
  const dirty = shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_STATUS_FAILED`);
  if (dirty) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  if (head !== origin) {
    const ancestor = shell("git", ["merge-base", "--is-ancestor", head, origin], `${CONTRACT}_ANCESTOR_CHECK`, { allowFailure: true });
    if (ancestor.status !== 0) throw new Error(`${CONTRACT}_PINNED_HEAD_NOT_ANCESTOR_OF_NEWEST_MAIN:${head}:${origin}`);
    const changed = shell("git", ["diff", "--name-only", `${head}..${origin}`, "--", SOURCE_PATH], `${CONTRACT}_PROOF_DIFF_FAILED`);
    if (text(changed)) throw new Error(`${CONTRACT}_PROOF_FILE_CHANGED_ON_NEWEST_MAIN:${head}:${origin}`);
  }
  console.log(JSON.stringify({
    event: "AVANTIQO_INTELLIGENCE_FAST_POD_V5_SOURCE_GATE",
    pinned_head: head,
    newest_main: origin,
    newest_main_advanced: head !== origin,
    proof_file_unchanged: true,
    unrelated_parallel_commits_allowed: true,
    secrets_printed: false,
  }));
  return head;
}

async function dockerHubManifest() {
  const tokenUrl = `${DOCKER_AUTH}?service=registry.docker.io&scope=${encodeURIComponent(`repository:${PUBLIC_REPOSITORY}:pull`)}`;
  const tokenResponse = await fetch(tokenUrl, {
    headers: { Accept: "application/json", "User-Agent": "AvantiqoIntelligenceFastV5" },
    signal: AbortSignal.timeout(20_000),
  });
  const tokenRaw = await tokenResponse.text();
  let tokenBody = null;
  try { tokenBody = tokenRaw ? JSON.parse(tokenRaw) : null; } catch { tokenBody = null; }
  if (!tokenResponse.ok) throw new Error(`${CONTRACT}_DOCKER_AUTH_HTTP_${tokenResponse.status}`);
  const pullToken = text(tokenBody?.token || tokenBody?.access_token);
  if (!pullToken) throw new Error(`${CONTRACT}_DOCKER_PULL_TOKEN_REQUIRED`);

  const manifestUrl = `${DOCKER_REGISTRY}/v2/${PUBLIC_REPOSITORY}/manifests/${encodeURIComponent(PUBLIC_TAG)}`;
  const response = await fetch(manifestUrl, {
    headers: {
      Authorization: `Bearer ${pullToken}`,
      Accept: [
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
      ].join(", "),
      "User-Agent": "AvantiqoIntelligenceFastV5",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${CONTRACT}_DOCKER_MANIFEST_HTTP_${response.status}`);
  const digest = text(response.headers.get("docker-content-digest"));
  if (!/^sha256:[a-f0-9]{64}$/i.test(digest)) throw new Error(`${CONTRACT}_DOCKER_MANIFEST_DIGEST_REQUIRED`);
  const mediaType = text(body?.mediaType || response.headers.get("content-type"));
  const manifests = Array.isArray(body?.manifests) ? body.manifests : [];
  const amd64 = manifests.length
    ? manifests.some((row) => text(row?.platform?.os) === "linux" && text(row?.platform?.architecture) === "amd64")
    : true;
  if (!amd64) throw new Error(`${CONTRACT}_DOCKER_LINUX_AMD64_REQUIRED`);
  return {
    digest,
    immutableReference: `${PUBLIC_REPOSITORY}@${digest}`,
    mediaType,
    manifestCount: manifests.length,
    linuxAmd64Available: amd64,
  };
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const repoHead = sourceGate();
const image = await dockerHubManifest();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY_PREFLIGHT" : "PLAN",
  repository_head: repoHead,
  image_transport: "PUBLIC_DOCKER_HUB_IMMUTABLE_DIGEST",
  public_tag_reference: PUBLIC_TAG_REFERENCE,
  immutable_image_reference: image.immutableReference,
  manifest_media_type: image.mediaType || null,
  manifest_count: image.manifestCount,
  linux_amd64_available: image.linuxAmd64Available,
  container_registry_auth_required: false,
  max_runtime_boot_spend_usd: MAX_RUNTIME_BOOT_SPEND_USD,
  max_runtime_boot_wall_seconds: MAX_RUNTIME_BOOT_WALL_MS / 1000,
  same_fast_model: "Qwen/Qwen3-30B-A3B-Instruct-2507",
  same_shared_cache: "7obluigbr0",
  completion_request_performed: false,
  token_generation_performed: false,
  pod_created: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}_PUBLIC_IMAGE_PREFLIGHT=PASS`);

if (apply) {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const previousV3Approval = process.env[V3_APPROVAL_ENV];
  let createdAt = null;
  let createdPodId = "";
  let costPerHour = null;
  let runtimeSeen = false;
  let podImageRewritePerformed = false;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : text(input?.url);
    const method = text(init?.method || "GET").toUpperCase() || "GET";

    if (url === `${REST}/pods` && method === "POST") {
      let body = null;
      try { body = JSON.parse(text(init?.body) || "{}"); } catch { body = null; }
      if (!body || typeof body !== "object") throw new Error(`${CONTRACT}_POD_CREATE_BODY_REQUIRED`);
      body.imageName = image.immutableReference;
      delete body.containerRegistryAuthId;
      podImageRewritePerformed = true;
      const response = await originalFetch(input, { ...init, body: JSON.stringify(body) });
      if (response.ok) {
        const clone = response.clone();
        let created = null;
        try { created = await clone.json(); } catch { created = null; }
        const row = object(created?.pod || created?.data || created);
        createdPodId = text(row?.id);
        createdAt = Date.now();
        costPerHour = finite(row?.adjustedCostPerHr ?? row?.costPerHr, null);
        console.log(JSON.stringify({
          event: "AVANTIQO_INTELLIGENCE_FAST_POD_V5_CREATE_GUARD",
          pod_id_present: Boolean(createdPodId),
          immutable_public_image_bound: true,
          container_registry_auth_sent: false,
          cost_per_hour_present: costPerHour !== null,
          max_runtime_boot_spend_usd: MAX_RUNTIME_BOOT_SPEND_USD,
          max_runtime_boot_wall_seconds: MAX_RUNTIME_BOOT_WALL_MS / 1000,
          secrets_printed: false,
        }));
      }
      return response;
    }

    if (url.startsWith(GRAPHQL) && method === "POST") {
      const response = await originalFetch(input, init);
      if (response.ok && createdPodId) {
        const clone = response.clone();
        try {
          const payload = await clone.json();
          const pod = object(payload?.data?.pod);
          if (text(pod?.id) === createdPodId && pod?.runtime?.uptimeInSeconds != null) runtimeSeen = true;
        } catch {}
      }
      return response;
    }

    if (createdAt && !runtimeSeen && url.startsWith(`${REST}/pods/`) && method === "GET") {
      const elapsedMs = Date.now() - createdAt;
      const estimatedSpend = costPerHour == null ? null : costPerHour * elapsedMs / 3_600_000;
      if ((estimatedSpend !== null && estimatedSpend >= MAX_RUNTIME_BOOT_SPEND_USD) || elapsedMs >= MAX_RUNTIME_BOOT_WALL_MS) {
        throw new Error(`${CONTRACT}_RUNTIME_BOOT_GUARD:elapsed_ms=${elapsedMs}:estimated_spend_usd=${estimatedSpend == null ? "UNKNOWN" : estimatedSpend.toFixed(4)}`);
      }
    }

    return originalFetch(input, init);
  };

  process.env[V3_APPROVAL_ENV] = "YES";
  try {
    await import(V3_PATH);
    if (!podImageRewritePerformed) throw new Error(`${CONTRACT}_POD_IMAGE_REWRITE_NOT_PERFORMED`);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousV3Approval === undefined) delete process.env[V3_APPROVAL_ENV];
    else process.env[V3_APPROVAL_ENV] = previousV3Approval;
  }
}
