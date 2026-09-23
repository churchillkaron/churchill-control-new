import crypto from "node:crypto";

import { supabaseAdmin } from "../../shared/supabase/admin.js";
import { localCodeWorkspaceCommandPolicy } from "./CodeWorkspaceLocalRuntime.js";

export const CODE_WORKSPACE_DEVICE_CONTRACT = "AVANTIQO_CODE_WORKSPACE_DEVICE_V1";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 700;
const CONTROL_PLANE_QUERY_TIMEOUT_MS = 5000;

function controlPlaneSignal() {
  return AbortSignal.timeout(CONTROL_PLANE_QUERY_TIMEOUT_MS);
}

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function integer(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}
function normalizedTimeout(value) {
  return Math.max(30_000, Math.min(MAX_TIMEOUT_MS, integer(value, DEFAULT_TIMEOUT_MS)));
}
function uuid(value, code) {
  const candidate = text(value, 160);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)) {
    throw new Error(code);
  }
  return candidate;
}
async function deviceForOrganization(organizationId, deviceId) {
  const result = await supabaseAdmin
    .from("avantiqo_code_devices")
    .select("id,organization_id,display_name,platform,enabled,capabilities,allowed_roots,last_seen_at,metadata")
    .eq("id", deviceId)
    .eq("organization_id", organizationId)
    .maybeSingle()
    .abortSignal(controlPlaneSignal());
  if (result.error) throw result.error;
  if (!result.data || result.data.enabled !== true) throw new Error("CODE_AI_DEVICE_NOT_AVAILABLE");
  const seen = new Date(result.data.last_seen_at || 0).getTime();
  if (!Number.isFinite(seen) || Date.now() - seen > 90_000) throw new Error("CODE_AI_DEVICE_OFFLINE");
  return result.data;
}
async function enqueueAndWait({ organizationId, deviceId, missionId, action, payload, timeoutMs }) {
  const inserted = await supabaseAdmin
    .from("avantiqo_code_device_jobs")
    .insert({
      organization_id: organizationId,
      device_id: deviceId,
      mission_id: missionId || null,
      action,
      payload: payload || {},
      priority: 90,
      max_attempts: 2,
    })
    .select("id")
    .single()
    .abortSignal(controlPlaneSignal());
  if (inserted.error || !inserted.data?.id) throw inserted.error || new Error("CODE_AI_DEVICE_JOB_INSERT_FAILED");

  const deadline = Date.now() + normalizedTimeout(timeoutMs);
  while (Date.now() < deadline) {
    const current = await supabaseAdmin
      .from("avantiqo_code_device_jobs")
      .select("status,result,error_code,metrics,device_id")
      .eq("id", inserted.data.id)
      .eq("organization_id", organizationId)
      .maybeSingle()
      .abortSignal(controlPlaneSignal());
    if (current.error) throw current.error;
    const row = current.data;
    if (!row) throw new Error("CODE_AI_DEVICE_JOB_DISAPPEARED");
    if (row.status === "COMPLETED") return row.result || {};
    if (["FAILED", "CANCELLED"].includes(row.status)) {
      throw new Error(text(row.error_code, 1000) || `CODE_AI_DEVICE_JOB_${row.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  throw new Error(`CODE_AI_DEVICE_JOB_TIMEOUT:${action}`);
}

function deviceWorkspaceSessionObject({ organizationId, deviceId, device, missionId, sessionId, repositoryUrl, ref, baseCommit, opened = {}, timeoutMs }) {
  let stopped = false;
  const call = (action, payload = {}, specificTimeout = null) => enqueueAndWait({
    organizationId, deviceId, missionId, action, payload: { session_id: sessionId, ...payload }, timeoutMs: specificTimeout || timeoutMs,
  });
  return {
    contract: CODE_WORKSPACE_DEVICE_CONTRACT, transport: "AVANTIQO_DEVICE", workspace_target: "DEVICE",
    device_id: deviceId, device_name: device.display_name, device_platform: device.platform, session_id: sessionId,
    repository_root: text(opened.repository_root, 2000) || null, source_repository_root: text(opened.source_repository_root, 2000) || null,
    repository_url: repositoryUrl, ref: text(ref, 160) || "main", base_commit: text(baseCommit, 160),
    exact_commit_ref: opened.exact_commit_ref === true, remote_fetch_performed: opened.remote_fetch_performed === true, resume: { applied: opened.resume_applied === true },
    inspect: () => call("workspace.inspect"), search: (input) => call("workspace.search", { input }), read: (input) => call("workspace.read", { input }),
    fileTree: () => call("workspace.file_tree"), ideState: () => call("workspace.ide_state"),
    acquireEditLease: ({ owner = "HUMAN", ttl_ms = 120000 } = {}) => call("workspace.ide_lease", { owner, ttl_ms }),
    releaseEditLease: ({ owner = "HUMAN" } = {}) => call("workspace.ide_lease", { owner, release: true }),
    ideWrite: ({ file_path, content, expected_revision, owner = "HUMAN" } = {}) => call("workspace.ide_write", { file_path, content, expected_revision, owner }),
    applyFiles: (files) => call("workspace.apply_files", { files, actor: "CODE" }),
    run: ({ command, args = [], cwd = ".", timeout_ms: commandTimeout, actor = "CODE" } = {}) => { const policy = localCodeWorkspaceCommandPolicy({ command, args }); if (!policy.allowed) throw new Error(policy.reason); return call("workspace.run", { command, args, cwd, timeout_ms: commandTimeout || null, actor: text(actor, 40).toUpperCase() || "CODE" }, commandTimeout); },
    browserVerify: (input = {}) => call("browser.verify", { input }, input?.timeout_ms || null),
    startDetached: async () => { throw new Error("CODE_AI_DEVICE_DETACHED_PROCESS_USE_BROWSER_RUNTIME"); }, diff: () => call("workspace.diff"),
    stop: async () => { if (stopped) return; stopped = true; await call("workspace.stop").catch(() => null); },
  };
}

export async function bindDeviceCodeWorkspace({ organization_id, device_id, session_id, timeout_ms = DEFAULT_TIMEOUT_MS } = {}) {
  const organizationId = uuid(organization_id, "CODE_AI_DEVICE_ORGANIZATION_REQUIRED");
  const deviceId = uuid(device_id, "CODE_AI_DEVICE_ID_REQUIRED");
  const sessionId = uuid(session_id, "CODE_AI_DEVICE_SESSION_ID_REQUIRED");
  const device = await deviceForOrganization(organizationId, deviceId);
  const missionId = `device-bind-${crypto.randomUUID()}`;
  return deviceWorkspaceSessionObject({
    organizationId, deviceId, device, missionId, sessionId, repositoryUrl: null, ref: "main", baseCommit: null, opened: {}, timeoutMs: timeout_ms,
  });
}

export async function attachDeviceCodeWorkspace({ organization_id, device_id, session_id, timeout_ms = DEFAULT_TIMEOUT_MS } = {}) {
  const organizationId = uuid(organization_id, "CODE_AI_DEVICE_ORGANIZATION_REQUIRED");
  const deviceId = uuid(device_id, "CODE_AI_DEVICE_ID_REQUIRED");
  const sessionId = uuid(session_id, "CODE_AI_DEVICE_SESSION_ID_REQUIRED");
  const device = await deviceForOrganization(organizationId, deviceId);
  const missionId = `device-attach-${crypto.randomUUID()}`;
  const attached = await enqueueAndWait({ organizationId, deviceId, missionId, action: "workspace.attach", payload: { session_id: sessionId }, timeoutMs: timeout_ms });
  if (!text(attached.base_commit, 160) || !text(attached.repository_url, 1000)) throw new Error("CODE_AI_DEVICE_SESSION_ATTACH_INVALID");
  return deviceWorkspaceSessionObject({ organizationId, deviceId, device, missionId, sessionId, repositoryUrl: text(attached.repository_url,1000), ref: text(attached.ref,160)||"main", baseCommit: text(attached.base_commit,160), opened: attached, timeoutMs: timeout_ms });
}

export async function openDeviceCodeWorkspace({
  organization_id,
  device_id,
  repository_url,
  ref = "main",
  resume_patch = null,
  timeout_ms = DEFAULT_TIMEOUT_MS,
} = {}) {
  const organizationId = uuid(organization_id, "CODE_AI_DEVICE_ORGANIZATION_REQUIRED");
  const deviceId = uuid(device_id, "CODE_AI_DEVICE_ID_REQUIRED");
  const repositoryUrl = text(repository_url, 1000);
  if (!repositoryUrl) throw new Error("CODE_AI_DEVICE_REPOSITORY_REQUIRED");
  const device = await deviceForOrganization(organizationId, deviceId);
  const missionId = `device-workspace-${crypto.randomUUID()}`;
  const opened = await enqueueAndWait({
    organizationId,
    deviceId,
    missionId,
    action: "workspace.open",
    payload: { repository_url: repositoryUrl, ref: text(ref, 160) || "main", resume_patch: resume_patch || null },
    timeoutMs: timeout_ms,
  });
  const sessionId = text(opened.session_id, 240);
  if (!sessionId || !text(opened.base_commit, 160)) throw new Error("CODE_AI_DEVICE_WORKSPACE_OPEN_INVALID");
  return deviceWorkspaceSessionObject({ organizationId, deviceId, device, missionId, sessionId, repositoryUrl, ref, baseCommit: text(opened.base_commit,160), opened, timeoutMs: timeout_ms });
}

export const CodeWorkspaceDeviceRuntime = Object.freeze({
  contract: CODE_WORKSPACE_DEVICE_CONTRACT,
  open: openDeviceCodeWorkspace,
  attach: attachDeviceCodeWorkspace,
  bind: bindDeviceCodeWorkspace,
  commandPolicy: localCodeWorkspaceCommandPolicy,
});

export default CodeWorkspaceDeviceRuntime;
