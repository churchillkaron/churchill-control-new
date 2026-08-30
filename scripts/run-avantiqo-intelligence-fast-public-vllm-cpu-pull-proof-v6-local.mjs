import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_CPU_PULL_PROOF_V6";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_PUBLIC_VLLM_CPU_PULL_PROOF_V6_APPROVED";
const SOURCE_PATH = "scripts/run-avantiqo-intelligence-fast-public-vllm-cpu-pull-proof-v6-local.mjs";
const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const NETWORK_VOLUME_ID = "7obluigbr0";
const DATA_CENTER_ID = "US-CA-2";
const HTTP_PORT = 7999;
const PUBLIC_IMAGE = "runpod/worker-v1-vllm@sha256:312102926800275ccc6c3c6a879008eee857798915efe1d637eb7d94bf4d6cb7";
const POD_PREFIX = "avantiqo-intelligence-fast-v6-cpu-";
const WALL_TIMEOUT_MS = 8 * 60_000;
const POLL_MS = 5_000;
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED", "FAILED"]);

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const yes = (v) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(v).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(v) {
  return text(v).slice(0, 2500)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code, { allowFailure = false } = {}) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
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
  return head;
}

async function readJson(response, code, { allow404 = false } = {}) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) throw new Error(`${code}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  return body ?? {};
}

async function rest(path, key, options = {}) {
  const response = await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_REST`, { allow404: options.allow404 === true });
}

async function graphql(query, key) {
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${CONTRACT}_GRAPHQL_HTTP_${response.status}:${redact(raw)}`);
  if (list(body?.errors).length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${redact(list(body.errors).map((x) => x?.message).join(" | "))}`);
  return object(body?.data);
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_CREDENTIAL_REQUIRED`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const repoHead = sourceGate();
const owner = crypto.randomBytes(6).toString("hex");
const podName = `${POD_PREFIX}${owner}`;
let podId = "";
let deletePerformed = false;
let deleteVerified = false;
let runtimeSeen = false;
let portSeen = false;
let statusSeen = false;
let machineAssigned = false;
let createdAt = null;
let costPerHour = null;

async function listOwned() {
  const raw = await rest("/pods?includeMachine=true&includeNetworkVolume=true", managementKey);
  const rows = Array.isArray(raw) ? raw : list(raw?.pods || raw?.data || raw?.items || raw?.results);
  return rows.filter((row) => text(row?.name) === podName);
}

async function cleanup() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const rows = await listOwned().catch(() => []);
    if (!rows.length) { deleteVerified = true; return; }
    for (const row of rows) {
      const id = text(row?.id);
      if (!id) continue;
      try { await rest(`/pods/${encodeURIComponent(id)}`, managementKey, { method: "DELETE", timeoutMs: 30_000 }); deletePerformed = true; } catch {}
    }
    await sleep(3_000);
  }
  const rows = await listOwned().catch(() => []);
  if (!rows.length) { deleteVerified = true; return; }
  throw new Error(`${CONTRACT}_DELETE_NOT_VERIFIED:${rows.length}`);
}

process.on("SIGINT", () => { void cleanup().finally(() => { process.exitCode = 130; }); });
process.on("SIGTERM", () => { void cleanup().finally(() => { process.exitCode = 143; }); });

const script = `import http.server, json, os, time\nSTART=time.time()\nclass H(http.server.BaseHTTPRequestHandler):\n    def do_GET(self):\n        body=json.dumps({\"ok\": True, \"uptime_seconds\": int(time.time()-START), \"workspace_exists\": os.path.isdir('/workspace'), \"gpu_used\": False, \"inference_performed\": False}).encode()\n        self.send_response(200); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)\n    def log_message(self,*args): return\nhttp.server.ThreadingHTTPServer(('0.0.0.0',${HTTP_PORT}),H).serve_forever()`;
const scriptB64 = Buffer.from(script, "utf8").toString("base64");

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    repository_head: repoHead,
    image_name: PUBLIC_IMAGE,
    compute_type: "CPU",
    data_center_id: DATA_CENTER_ID,
    network_volume_id: NETWORK_VOLUME_ID,
    http_port: HTTP_PORT,
    wall_timeout_seconds: WALL_TIMEOUT_MS / 1000,
    gpu_attached: false,
    gpu_compute_used: false,
    inference_performed: false,
    token_generation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PLAN_READY`);
} else {
  let failure = null;
  try {
    const created = await rest("/pods", managementKey, {
      method: "POST",
      timeoutMs: 60_000,
      body: {
        name: podName,
        imageName: PUBLIC_IMAGE,
        cloudType: "SECURE",
        computeType: "CPU",
        cpuFlavorIds: ["cpu3c"],
        cpuFlavorPriority: "custom",
        dataCenterIds: [DATA_CENTER_ID],
        dataCenterPriority: "custom",
        vcpuCount: 2,
        containerDiskInGb: 30,
        networkVolumeId: NETWORK_VOLUME_ID,
        volumeMountPath: "/workspace",
        globalNetworking: true,
        supportPublicIp: false,
        ports: [`${HTTP_PORT}/http`],
        dockerEntrypoint: ["python3", "-c"],
        dockerStartCmd: ["import base64,os;exec(compile(base64.b64decode(os.environ['AVANTIQO_V6_SCRIPT_B64']),'<avantiqo-v6>','exec'))"],
        env: { AVANTIQO_V6_SCRIPT_B64: scriptB64 },
      },
    });
    podId = text(created?.id || created?.pod?.id || created?.data?.id);
    if (!podId) throw new Error(`${CONTRACT}_POD_ID_REQUIRED`);
    createdAt = Date.now();
    costPerHour = finite(created?.costPerHr ?? created?.adjustedCostPerHr, null);

    const safeId = podId.replace(/[^A-Za-z0-9_-]/g, "");
    if (safeId !== podId) throw new Error(`${CONTRACT}_POD_ID_INVALID`);
    const deadline = Date.now() + WALL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const restPod = await rest(`/pods/${encodeURIComponent(podId)}?includeMachine=true&includeNetworkVolume=true`, managementKey, { allow404: true, timeoutMs: 20_000 });
      if (restPod?.__not_found) throw new Error(`${CONTRACT}_POD_DISAPPEARED`);
      const desired = text(restPod?.desiredStatus).toUpperCase();
      const status = text(restPod?.status ?? restPod?.runtimeStatus).toUpperCase();
      if (TERMINAL.has(desired) || TERMINAL.has(status)) throw new Error(`${CONTRACT}_POD_TERMINAL:${desired || status}`);
      machineAssigned = Boolean(text(restPod?.machineId || restPod?.machine?.id));

      const data = await graphql(`query { pod(input: {podId: "${safeId}"}) { id desiredStatus runtime { uptimeInSeconds ports { privatePort publicPort type isIpPublic } } } }`, managementKey);
      const runtime = object(data?.pod?.runtime);
      const uptime = runtime?.uptimeInSeconds == null ? null : finite(runtime.uptimeInSeconds, null);
      const ports = list(runtime?.ports);
      runtimeSeen = uptime !== null;
      portSeen = ports.some((port) => finite(port?.privatePort, -1) === HTTP_PORT);
      const elapsedMs = Date.now() - createdAt;
      const estimatedSpend = costPerHour == null ? null : Number((costPerHour * elapsedMs / 3_600_000).toFixed(4));

      console.log(JSON.stringify({
        event: "AVANTIQO_INTELLIGENCE_FAST_V6_CPU_PROGRESS",
        desired_status: desired || null,
        rest_runtime_status: status || null,
        machine_assigned: machineAssigned,
        runtime_telemetry_present: runtimeSeen,
        runtime_uptime_seconds: uptime,
        status_port_registered: portSeen,
        runtime_port_count: ports.length,
        cost_per_hour_present: costPerHour !== null,
        estimated_spend_usd: estimatedSpend,
        gpu_attached: false,
        gpu_compute_used: false,
        inference_performed: false,
        secrets_printed: false,
      }));

      if (runtimeSeen && portSeen) {
        const response = await fetch(`https://${podId}-${HTTP_PORT}.proxy.runpod.net/`, { signal: AbortSignal.timeout(10_000) });
        const raw = await response.text();
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
        if (response.ok && body?.ok === true) { statusSeen = true; break; }
      }
      await sleep(POLL_MS);
    }
    if (!statusSeen) throw new Error(`${CONTRACT}_CPU_RUNTIME_TIMEOUT`);
  } catch (error) {
    failure = error;
  } finally {
    try { await cleanup(); } catch (error) { if (!failure) failure = error; }
  }

  const success = !failure && machineAssigned && runtimeSeen && portSeen && statusSeen && deleteVerified;
  console.log(JSON.stringify({
    success,
    contract: CONTRACT,
    mode: "APPLY",
    repository_head: repoHead,
    image_name: PUBLIC_IMAGE,
    compute_type: "CPU",
    machine_assigned: machineAssigned,
    runtime_telemetry_present: runtimeSeen,
    status_port_registered: portSeen,
    status_route_passed: statusSeen,
    pod_delete_performed: deletePerformed,
    pod_delete_verified: deleteVerified,
    gpu_attached: false,
    gpu_compute_used: false,
    inference_performed: false,
    token_generation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
    failure: failure ? redact(failure?.message) : null,
  }, null, 2));
  console.log(`${CONTRACT}=${success ? "PASS" : "FAIL"}`);
  if (!success) process.exitCode = 1;
}
