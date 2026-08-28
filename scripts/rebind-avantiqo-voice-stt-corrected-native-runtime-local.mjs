import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_CORRECTED_NATIVE_RUNTIME_REBIND_V1";
const APPROVAL_ENV = "AVANTIQO_VOICE_STT_CORRECTED_NATIVE_RUNTIME_REBIND_APPROVED";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const TARGET_SOURCE_SHA = "ff11761b2876c70b74b0eaa45081dcaac592e9bc";
const TARGET_IMAGE = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:ff11761b2";
const SOURCE_LOCK = Object.freeze({
  handler: "d9d24ff5e2cde494cebde0d2df0a333d74ad0d91",
  dockerfile: "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d",
  requirements: "9b1f4d662a7b13b65d192493ed738998d2172698",
});
const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const TERMINAL = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
function required(name, fallback = "") { const value = text(process.env[name] || fallback); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function redact(value) { return text(value).replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]").replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]").slice(0, 900); }
function runGit(args, allowStatus1 = false) { const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env }); if (allowStatus1 && result.status === 1) return { status: 1, stdout: text(result.stdout), stderr: text(result.stderr) }; if (result.status !== 0) throw new Error(`GIT_${String(args[0] || "COMMAND").toUpperCase()}_FAILED:${redact(result.stderr || result.stdout)}`); return { status: 0, stdout: text(result.stdout), stderr: text(result.stderr) }; }
function gitText(args) { return runGit(args).stdout; }
function normalizeList(value, keys = [], depth = 0) { if (Array.isArray(value)) return value; if (!value || typeof value !== "object" || depth > 4) return null; for (const key of [...keys, "data", "items", "results"]) { if (!Object.prototype.hasOwnProperty.call(value, key)) continue; const found = normalizeList(value[key], keys, depth + 1); if (found) return found; } return null; }
function normalizeEnv(value) { if (Array.isArray(value)) return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => Boolean(key))); return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")])); }
async function readJson(response, label) { const raw = await response.text(); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch {} if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`); return body ?? {}; }
async function rest(pathname, key, options = {}) { return readJson(await fetch(`${REST}${pathname}`, { method: options.method || "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: options.body !== undefined ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(30_000) }), "AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_REST"); }
async function restAttempt(pathname, key, options = {}) { const response = await fetch(`${REST}${pathname}`, { method: options.method || "GET", headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) }, body: options.body !== undefined ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(30_000) }); const raw = await response.text(); let body = null; try { body = raw ? JSON.parse(raw) : null; } catch {} return { ok: response.ok, status: response.status, detail: response.ok ? null : redact(body?.message || body?.error || body?.detail || raw) }; }
async function queueHealth(endpointId, key) { return readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) }), "AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_QUEUE"); }
async function controlWorkers(endpointId, key) { const body = await readJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30_000) }), "AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_CONTROL"); return list(body?.workers); }
function healthJobs(body = {}) { const jobs = object(body.jobs); return { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) }; }
function activeWorkers(workers) { return workers.filter((worker) => { if (worker?.isStale === true) return false; const status = text(worker?.status || worker?.workerStatus || worker?.runtimeStatus || worker?.desiredStatus).toUpperCase(); return status && !TERMINAL.has(status); }); }
function verifySource() { runGit(["fetch", "origin", "main", "--quiet"]); if (gitText(["rev-parse", `${TARGET_SOURCE_SHA}^{commit}`]) !== TARGET_SOURCE_SHA) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_TARGET_SOURCE_REQUIRED"); const blobs = { handler: gitText(["rev-parse", `${TARGET_SOURCE_SHA}:services/avantiqo-voice-stt/handler.py`]), dockerfile: gitText(["rev-parse", `${TARGET_SOURCE_SHA}:services/avantiqo-voice-stt/Dockerfile`]), requirements: gitText(["rev-parse", `${TARGET_SOURCE_SHA}:services/avantiqo-voice-stt/requirements.txt`]) }; for (const key of Object.keys(SOURCE_LOCK)) if (blobs[key] !== SOURCE_LOCK[key]) throw new Error(`AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_${key.toUpperCase()}_LOCK_INVALID:${blobs[key]}`); const drift = runGit(["diff", "--quiet", TARGET_SOURCE_SHA, "origin/main", "--", "services/avantiqo-voice-stt"], true); if (drift.status === 1) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_VOICE_SOURCE_MOVED"); return { source_sha: TARGET_SOURCE_SHA, image: TARGET_IMAGE, blobs, newest_main_voice_equivalent: true }; }
async function snapshot(managementKey, queueKey) { const [endpointsRaw, templatesRaw] = await Promise.all([rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey), rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey)]); const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]); const templates = normalizeList(templatesRaw, ["templates"]); if (!endpoints || !templates) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_INVENTORY_INVALID"); const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME); if (matches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_ENDPOINT_RESOLUTION_FAILED:${matches.length}`); const endpoint = matches[0]; const endpointId = text(endpoint.id); const templateId = text(endpoint.templateId || endpoint.template?.id); if (!endpointId || !templateId) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_ENDPOINT_TEMPLATE_REQUIRED"); const templateMatches = templates.filter((template) => text(template?.id) === templateId); if (templateMatches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`); const consumers = endpoints.filter((item) => text(item?.templateId || item?.template?.id) === templateId); const [health, workers] = await Promise.all([queueHealth(endpointId, queueKey), controlWorkers(endpointId, managementKey)]); return { endpoint, endpointId, template: templateMatches[0], templateId, consumers, jobs: healthJobs(health), workers }; }
function assertClean(state) { const reasons = []; if (finite(state.endpoint?.workersMin, -1) !== 0) reasons.push("WORKERS_MIN_NOT_ZERO"); if (finite(state.endpoint?.workersMax, -1) !== 0) reasons.push("WORKERS_MAX_NOT_ZERO"); if (state.jobs.in_queue !== 0) reasons.push("JOBS_IN_QUEUE"); if (state.jobs.in_progress !== 0) reasons.push("JOBS_IN_PROGRESS"); if (activeWorkers(state.workers).length) reasons.push("ACTIVE_WORKER_PRESENT"); if (state.consumers.length !== 1 || text(state.consumers[0]?.id) !== state.endpointId) reasons.push(`TEMPLATE_NOT_EXCLUSIVE_${state.consumers.length}`); if (reasons.length) throw new Error(`AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_ENDPOINT_NOT_CLEAN:${reasons.join(",")}`); }
function templateBody(template, authValue) { return { containerDiskInGb: Math.max(1, finite(template?.containerDiskInGb, 30)), containerRegistryAuthId: authValue, dockerEntrypoint: [], dockerStartCmd: [], env: normalizeEnv(template?.env), imageName: TARGET_IMAGE, isPublic: template?.isPublic === true, name: text(template?.name), ports: list(template?.ports), readme: text(template?.readme), volumeInGb: Math.max(0, finite(template?.volumeInGb, 0)), volumeMountPath: text(template?.volumeMountPath) || "/workspace" }; }
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const source = verifySource();
const initial = await snapshot(managementKey, queueKey);
assertClean(initial);
const initialImage = text(initial.template?.imageName);
const initialAuth = text(initial.template?.containerRegistryAuthId);
const plan = { success: true, contract: CONTRACT, mode: apply ? "APPLY" : "PLAN", endpoint_name: ENDPOINT_NAME, source, current_image: initialImage || null, target_image: TARGET_IMAGE, image_change_required: initialImage !== TARGET_IMAGE, registry_auth_present: Boolean(initialAuth), registry_auth_clear_required: Boolean(initialAuth), workers_min: 0, workers_max: 0, jobs: initial.jobs, generation_submitted: false, probe_job_submitted: false, transcription_job_submitted: false, tts_touched: false, music_touched: false, production_deploy_performed: false, secrets_printed: false };
if (!apply) { console.log(JSON.stringify(plan, null, 2)); console.log("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_RUNTIME_REBIND=PLAN"); } else {
  const before = await snapshot(managementKey, queueKey); assertClean(before);
  if (before.templateId !== initial.templateId) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_TEMPLATE_CHANGED");
  if (text(before.template?.imageName) !== initialImage) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_IMAGE_CHANGED_CONCURRENTLY");
  if (text(before.template?.containerRegistryAuthId) !== initialAuth) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_AUTH_CHANGED_CONCURRENTLY");
  const attempts = []; let verified = null;
  for (const authValue of [null, ""]) {
    const response = await restAttempt(`/templates/${encodeURIComponent(before.templateId)}/update`, managementKey, { method: "POST", body: templateBody(before.template, authValue) });
    attempts.push({ auth_value: authValue === null ? "NULL" : "EMPTY", http_status: response.status, accepted: response.ok, detail: response.detail });
    if (!response.ok) continue;
    const after = await snapshot(managementKey, queueKey); assertClean(after);
    if (after.templateId !== before.templateId) throw new Error("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_TEMPLATE_CHANGED_AFTER_WRITE");
    if (text(after.template?.imageName) !== TARGET_IMAGE) continue;
    if (text(after.template?.containerRegistryAuthId)) continue;
    if (list(after.template?.dockerEntrypoint).length || list(after.template?.dockerStartCmd).length) continue;
    verified = after; break;
  }
  if (!verified) throw new Error(`AVANTIQO_VOICE_STT_CORRECTED_NATIVE_REBIND_VERIFY_FAILED:${JSON.stringify(attempts)}`);
  console.log(JSON.stringify({ ...plan, mode: "APPLY", success: true, attempts, final_image: text(verified.template?.imageName), final_registry_auth_present: Boolean(text(verified.template?.containerRegistryAuthId)), verified_workers_min: finite(verified.endpoint?.workersMin), verified_workers_max: finite(verified.endpoint?.workersMax), verified_jobs: verified.jobs, generation_submitted: false, probe_job_submitted: false, transcription_job_submitted: false, tts_touched: false, music_touched: false, production_deploy_performed: false, secrets_printed: false }, null, 2));
  console.log("AVANTIQO_VOICE_STT_CORRECTED_NATIVE_RUNTIME_REBIND=PASS");
}
