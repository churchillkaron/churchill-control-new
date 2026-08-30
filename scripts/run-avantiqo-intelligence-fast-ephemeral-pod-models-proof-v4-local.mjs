import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V4";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V4_APPROVED";
const SOURCE_PATH = "scripts/run-avantiqo-intelligence-fast-ephemeral-pod-models-proof-v4-local.mjs";
const V3_APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_EPHEMERAL_POD_MODELS_PROOF_V3_APPROVED";
const V3_PATH = "./run-avantiqo-intelligence-fast-ephemeral-pod-models-proof-v3-local.mjs";
const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const FAST_ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const PRIVATE_REGISTRY_PREFIX = "registry.runpod.net/";
const MAX_RUNTIME_BOOT_SPEND_USD = 0.12;
const MAX_RUNTIME_BOOT_WALL_MS = 120_000;

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
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
    event: "AVANTIQO_INTELLIGENCE_FAST_POD_V4_SOURCE_GATE",
    pinned_head: head,
    newest_main: origin,
    newest_main_advanced: head !== origin,
    proof_file_unchanged: true,
    unrelated_parallel_commits_allowed: true,
    secrets_printed: false,
  }));
  return head;
}

async function readJson(response, code) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  return body ?? {};
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

const endpointRows = (v) => Array.isArray(v) ? v : list(v?.endpoints || v?.data || v?.items || v?.results);
const templateRows = (v) => Array.isArray(v) ? v : list(v?.templates || v?.data || v?.items || v?.results);
const templateId = (e) => text(e?.templateId || e?.template_id || e?.template?.id);
const registryAuthId = (t) => text(t?.containerRegistryAuthId || t?.container_registry_auth_id || t?.containerRegistryAuth?.id);

function unwrapTemplate(v) {
  return object(v?.template || v?.data || v);
}

async function resolveRegistryContract(managementKey) {
  const [endpointsRaw, templatesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const matches = endpointRows(endpointsRaw).filter((row) => text(row?.name) === FAST_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_FAST_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const id = templateId(endpoint);
  if (!id) throw new Error(`${CONTRACT}_FAST_TEMPLATE_ID_REQUIRED`);

  const listed = templateRows(templatesRaw).find((row) => text(row?.id) === id) || null;
  const direct = unwrapTemplate(await rest(`/templates/${encodeURIComponent(id)}`, managementKey));
  const embedded = object(endpoint?.template);
  const imageName = text(direct?.imageName || direct?.image_name || listed?.imageName || listed?.image_name || embedded?.imageName || embedded?.image_name);
  if (!imageName) throw new Error(`${CONTRACT}_FAST_TEMPLATE_IMAGE_REQUIRED`);

  const candidates = [
    { source: "DIRECT_TEMPLATE", id: registryAuthId(direct) },
    { source: "LISTED_TEMPLATE", id: registryAuthId(listed) },
    { source: "EMBEDDED_ENDPOINT_TEMPLATE", id: registryAuthId(embedded) },
  ].filter((row) => row.id);
  const ids = [...new Set(candidates.map((row) => row.id))];
  if (ids.length > 1) throw new Error(`${CONTRACT}_REGISTRY_AUTH_AMBIGUOUS:${ids.length}`);

  const privateRegistryRequired = imageName.startsWith(PRIVATE_REGISTRY_PREFIX);
  const resolvedId = ids[0] || "";
  if (privateRegistryRequired && !resolvedId) throw new Error(`${CONTRACT}_PRIVATE_REGISTRY_AUTH_REQUIRED`);

  let verified = false;
  if (resolvedId) {
    const auth = await rest(`/containerregistryauth/${encodeURIComponent(resolvedId)}`, managementKey);
    if (text(auth?.id) !== resolvedId) throw new Error(`${CONTRACT}_REGISTRY_AUTH_VERIFY_FAILED`);
    verified = true;
  }

  return {
    endpointId: text(endpoint?.id),
    templateId: id,
    imageName,
    privateRegistryRequired,
    registryAuthId: resolvedId,
    registryAuthSource: candidates.find((row) => row.id === resolvedId)?.source || null,
    registryAuthVerified: verified,
  };
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const repoHead = sourceGate();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED`);
const registry = await resolveRegistryContract(managementKey);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY_PREFLIGHT" : "PLAN",
  repository_head: repoHead,
  endpoint_name: FAST_ENDPOINT_NAME,
  endpoint_id_present: Boolean(registry.endpointId),
  template_id_present: Boolean(registry.templateId),
  image_name: registry.imageName,
  private_registry_required: registry.privateRegistryRequired,
  registry_auth_present: Boolean(registry.registryAuthId),
  registry_auth_verified: registry.registryAuthVerified,
  registry_auth_source: registry.registryAuthSource,
  max_runtime_boot_spend_usd: MAX_RUNTIME_BOOT_SPEND_USD,
  max_runtime_boot_wall_seconds: MAX_RUNTIME_BOOT_WALL_MS / 1000,
  pod_created: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}_REGISTRY_PREFLIGHT=PASS`);

if (!apply) {
  const previousApproval = process.env[V3_APPROVAL_ENV];
  delete process.env[V3_APPROVAL_ENV];
  try {
    await import(V3_PATH);
  } finally {
    if (previousApproval === undefined) delete process.env[V3_APPROVAL_ENV];
    else process.env[V3_APPROVAL_ENV] = previousApproval;
  }
} else {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const previousApproval = process.env[V3_APPROVAL_ENV];
  let createdAt = null;
  let createdPodId = "";
  let costPerHour = null;
  let runtimeSeen = false;

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : text(input?.url);
    const method = text(init?.method || "GET").toUpperCase() || "GET";

    if (url === `${REST}/pods` && method === "POST") {
      let body = null;
      try { body = JSON.parse(text(init?.body) || "{}"); } catch { body = null; }
      if (!body || typeof body !== "object") throw new Error(`${CONTRACT}_POD_CREATE_BODY_REQUIRED`);
      if (text(body.imageName) !== registry.imageName) throw new Error(`${CONTRACT}_POD_IMAGE_MISMATCH`);
      if (registry.privateRegistryRequired && !registry.registryAuthVerified) throw new Error(`${CONTRACT}_REGISTRY_AUTH_NOT_VERIFIED`);
      if (text(body.containerRegistryAuthId) && text(body.containerRegistryAuthId) !== registry.registryAuthId) {
        throw new Error(`${CONTRACT}_POD_REGISTRY_AUTH_CONFLICT`);
      }
      body.containerRegistryAuthId = registry.registryAuthId;
      const response = await originalFetch(input, { ...init, body: JSON.stringify(body) });
      if (response.ok) {
        const clone = response.clone();
        let created = null;
        try { created = await clone.json(); } catch { created = null; }
        const row = object(created?.pod || created?.data || created);
        createdPodId = text(row?.id);
        createdAt = Date.now();
        costPerHour = finite(row?.adjustedCostPerHr ?? row?.costPerHr, null);
        const returnedAuthId = text(row?.containerRegistryAuthId);
        if (registry.registryAuthId && returnedAuthId !== registry.registryAuthId) {
          throw new Error(`${CONTRACT}_POD_REGISTRY_AUTH_NOT_BOUND`);
        }
        console.log(JSON.stringify({
          event: "AVANTIQO_INTELLIGENCE_FAST_POD_V4_CREATE_GUARD",
          pod_id_present: Boolean(createdPodId),
          registry_auth_bound: returnedAuthId === registry.registryAuthId,
          cost_per_hour_present: costPerHour !== null,
          max_runtime_boot_spend_usd: MAX_RUNTIME_BOOT_SPEND_USD,
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
        throw new Error(`${CONTRACT}_RUNTIME_BOOT_COST_GUARD:elapsed_ms=${elapsedMs}:estimated_spend_usd=${estimatedSpend == null ? "UNKNOWN" : estimatedSpend.toFixed(4)}`);
      }
    }

    return originalFetch(input, init);
  };

  process.env[V3_APPROVAL_ENV] = "YES";
  try {
    await import(V3_PATH);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApproval === undefined) delete process.env[V3_APPROVAL_ENV];
    else process.env[V3_APPROVAL_ENV] = previousApproval;
  }
}
