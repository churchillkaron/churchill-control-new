import crypto from "node:crypto";

import { supabaseAdmin } from "../../shared/supabase/admin.js";
import { localCodeWorkspaceCommandPolicy } from "./CodeWorkspaceLocalRuntime.js";

export const CODE_WORKSPACE_DEVICE_CONTRACT = "AVANTIQO_CODE_WORKSPACE_DEVICE_V1";
const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;
const MAX_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 150;
const CONTROL_PLANE_QUERY_TIMEOUTS_MS = Object.freeze([5000, 10000, 15000]);
const CONTROL_PLANE_MAX_ATTEMPTS = CONTROL_PLANE_QUERY_TIMEOUTS_MS.length;
const CONTROL_PLANE_RETRY_DELAYS_MS = Object.freeze([150, 450, 1000]);

function controlPlaneSignal(attempt = 0) {
  const timeoutMs =
    CONTROL_PLANE_QUERY_TIMEOUTS_MS[Math.min(Math.max(0, Number(attempt) || 0), CONTROL_PLANE_QUERY_TIMEOUTS_MS.length - 1)];
  return AbortSignal.timeout(timeoutMs);
}

function controlPlaneRetryable(error) {
  const message = text(error?.message || error, 1600).toLowerCase();
  const status = Number(error?.status ?? error?.statusCode ?? error?.error_code ?? error?.code);
  return Boolean(
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    (Number.isInteger(status) && status >= 500 && status <= 599) ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted") ||
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("connection terminated") ||
    message.includes("connection reset") ||
    message.includes("statement timeout") ||
    message.includes("ssl handshake") ||
    message.includes("cloudflare") ||
    message.includes("error 525") ||
    message.includes("ssl_handshake_failed")
  );
}

async function controlPlaneRead(factory) {
  let lastError = null;
  for (let attempt = 0; attempt < CONTROL_PLANE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await factory(attempt);
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      lastError = error;
      if (!controlPlaneRetryable(error) || attempt >= CONTROL_PLANE_MAX_ATTEMPTS - 1) throw error;
      const delay = CONTROL_PLANE_RETRY_DELAYS_MS[Math.min(attempt, CONTROL_PLANE_RETRY_DELAYS_MS.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError || new Error("CODE_AI_DEVICE_CONTROL_PLANE_READ_FAILED");
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
  const result = await controlPlaneRead((attempt) => supabaseAdmin
    .from("avantiqo_code_devices")
    .select("id,organization_id,display_name,platform,enabled,capabilities,allowed_roots,last_seen_at,metadata")
    .eq("id", deviceId)
    .eq("organization_id", organizationId)
    .maybeSingle()
    .abortSignal(controlPlaneSignal(attempt)));
  if (!result.data || result.data.enabled !== true) throw new Error("CODE_AI_DEVICE_NOT_AVAILABLE");
  const seen = new Date(result.data.last_seen_at || 0).getTime();
  if (!Number.isFinite(seen) || Date.now() - seen > 90_000) throw new Error("CODE_AI_DEVICE_OFFLINE");
  return result.data;
}
async function ensureDeviceJob({
  organizationId,
  deviceId,
  missionId,
  action,
  payload,
  jobId,
}) {
  const row = {
    id: jobId,
    organization_id: organizationId,
    device_id: deviceId,
    mission_id: missionId || null,
    action,
    payload: payload || {},
    priority: 90,
    max_attempts: 2,
  };
  let lastError = null;

  for (let attempt = 0; attempt < CONTROL_PLANE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const inserted = await supabaseAdmin
        .from("avantiqo_code_device_jobs")
        .upsert(row, { onConflict: "id", ignoreDuplicates: true })
        .select("id")
        .abortSignal(controlPlaneSignal(attempt));
      if (inserted.error) throw inserted.error;
      const insertedId = Array.isArray(inserted.data)
        ? inserted.data[0]?.id
        : inserted.data?.id;
      if (text(insertedId, 160) === jobId) return jobId;

      const existing = await controlPlaneRead((readAttempt) => supabaseAdmin
        .from("avantiqo_code_device_jobs")
        .select("id,organization_id,device_id,mission_id,action")
        .eq("id", jobId)
        .eq("organization_id", organizationId)
        .eq("device_id", deviceId)
        .maybeSingle()
        .abortSignal(controlPlaneSignal(readAttempt)));
      if (
        existing.data?.id === jobId &&
        text(existing.data?.mission_id, 240) === text(missionId, 240) &&
        text(existing.data?.action, 120) === text(action, 120)
      ) {
        return jobId;
      }
      throw new Error("CODE_AI_DEVICE_JOB_IDEMPOTENCY_BINDING_MISMATCH");
    } catch (error) {
      lastError = error;
      if (!controlPlaneRetryable(error) || attempt >= CONTROL_PLANE_MAX_ATTEMPTS - 1) {
        throw error;
      }
      const delay = CONTROL_PLANE_RETRY_DELAYS_MS[Math.min(attempt, CONTROL_PLANE_RETRY_DELAYS_MS.length - 1)];
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("CODE_AI_DEVICE_JOB_INSERT_FAILED");
}

async function cancelQueuedDeviceJob({ organizationId, deviceId, jobId }) {
  try {
    const cancelled = await supabaseAdmin
      .from("avantiqo_code_device_jobs")
      .update({
        status: "CANCELLED",
        payload: {},
        leased_until: null,
        completed_at: new Date().toISOString(),
        error_code: "CODE_AI_DEVICE_JOB_CANCELLED_AFTER_CLIENT_TIMEOUT",
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .eq("device_id", deviceId)
      .eq("status", "QUEUED")
      .select("id,status")
      .maybeSingle()
      .abortSignal(controlPlaneSignal(0));
    if (cancelled.error) throw cancelled.error;
    if (cancelled.data?.id === jobId) {
      return { cancelled: true, final_status: "CANCELLED" };
    }

    const current = await controlPlaneRead((attempt) => supabaseAdmin
      .from("avantiqo_code_device_jobs")
      .select("id,status")
      .eq("id", jobId)
      .eq("organization_id", organizationId)
      .eq("device_id", deviceId)
      .maybeSingle()
      .abortSignal(controlPlaneSignal(attempt)));
    return {
      cancelled: false,
      final_status: text(current.data?.status, 40) || "UNKNOWN",
    };
  } catch (error) {
    return {
      cancelled: false,
      final_status: "UNKNOWN",
      cancellation_error: text(error?.message || error, 500),
    };
  }
}

async function enqueueAndWait({ organizationId, deviceId, missionId, action, payload, timeoutMs }) {
  const jobId = crypto.randomUUID();
  await ensureDeviceJob({
    organizationId,
    deviceId,
    missionId,
    action,
    payload,
    jobId,
  });

  const deadline = Date.now() + normalizedTimeout(timeoutMs);
  while (Date.now() < deadline) {
    try {
      const current = await controlPlaneRead((attempt) => supabaseAdmin
        .from("avantiqo_code_device_jobs")
        .select("status,result,error_code,metrics,device_id")
        .eq("id", jobId)
        .eq("organization_id", organizationId)
        .maybeSingle()
        .abortSignal(controlPlaneSignal(attempt)));
      const row = current.data;
      if (!row) throw new Error("CODE_AI_DEVICE_JOB_DISAPPEARED");
      if (row.status === "COMPLETED") return row.result || {};
      if (["FAILED", "CANCELLED"].includes(row.status)) {
        throw new Error(text(row.error_code, 1000) || `CODE_AI_DEVICE_JOB_${row.status}`);
      }
    } catch (error) {
      if (!controlPlaneRetryable(error) || Date.now() >= deadline) throw error;
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  const cancellation = await cancelQueuedDeviceJob({ organizationId, deviceId, jobId });
  const error = new Error(
    cancellation.cancelled === true
      ? `CODE_AI_DEVICE_JOB_TIMEOUT_QUEUED_CANCELLED:${action}`
      : `CODE_AI_DEVICE_JOB_TIMEOUT_IN_FLIGHT_UNCERTAIN:${action}:${cancellation.final_status || "UNKNOWN"}`,
  );
  error.details = {
    job_id: jobId,
    action,
    queued_job_cancelled: cancellation.cancelled === true,
    final_status: cancellation.final_status || "UNKNOWN",
    cancellation_error: cancellation.cancellation_error || null,
    authorization_effect: "NONE",
  };
  throw error;
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
    replaceRange: (input) => call("workspace.replace_range", { input, actor: "CODE" }),
    run: ({ command, args = [], cwd = ".", timeout_ms: commandTimeout, actor = "CODE", env = null } = {}) => { const policy = localCodeWorkspaceCommandPolicy({ command, args, env }); if (!policy.allowed) throw new Error(policy.reason); return call("workspace.run", { command, args, cwd, timeout_ms: commandTimeout || null, actor: text(actor, 40).toUpperCase() || "CODE", env }, commandTimeout); },
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

export async function attachDeviceCodeWorkspace({
  organization_id,
  device_id,
  session_id,
  repository_url = null,
  ref = null,
  base_commit = null,
  timeout_ms = DEFAULT_TIMEOUT_MS,
} = {}) {
  const organizationId = uuid(organization_id, "CODE_AI_DEVICE_ORGANIZATION_REQUIRED");
  const deviceId = uuid(device_id, "CODE_AI_DEVICE_ID_REQUIRED");
  const sessionId = uuid(session_id, "CODE_AI_DEVICE_SESSION_ID_REQUIRED");
  const device = await deviceForOrganization(organizationId, deviceId);
  const missionId = `device-attach-${crypto.randomUUID()}`;
  const attached = await enqueueAndWait({ organizationId, deviceId, missionId, action: "workspace.attach", payload: { session_id: sessionId }, timeoutMs: timeout_ms });
  const attachedRepositoryUrl = text(attached.repository_url, 1000);
  const attachedRef = text(attached.ref, 160) || "main";
  const attachedBaseCommit = text(attached.base_commit, 160);
  if (!attachedBaseCommit || !attachedRepositoryUrl) throw new Error("CODE_AI_DEVICE_SESSION_ATTACH_INVALID");
  const expectedRepositoryUrl = text(repository_url, 1000);
  const expectedRef = text(ref, 160);
  const expectedBaseCommit = text(base_commit, 160);
  const normalizeRepository = (value) => text(value, 1000).toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
  if (expectedRepositoryUrl && normalizeRepository(attachedRepositoryUrl) !== normalizeRepository(expectedRepositoryUrl)) {
    throw new Error("CODE_AI_DEVICE_SESSION_REPOSITORY_MISMATCH");
  }
  if (expectedRef && attachedRef !== expectedRef) {
    throw new Error("CODE_AI_DEVICE_SESSION_REF_MISMATCH");
  }
  if (expectedBaseCommit && attachedBaseCommit !== expectedBaseCommit) {
    throw new Error("CODE_AI_DEVICE_SESSION_BASE_COMMIT_MISMATCH");
  }
  return deviceWorkspaceSessionObject({ organizationId, deviceId, device, missionId, sessionId, repositoryUrl: attachedRepositoryUrl, ref: attachedRef, baseCommit: attachedBaseCommit, opened: attached, timeoutMs: timeout_ms });
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
