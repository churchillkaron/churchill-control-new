import {
  codeWorkspaceLocalCommandPolicy,
  codeWorkspaceUniversalCommandPolicy,
} from "./CodeWorkspaceCommandPolicyRuntime.js";

export const CODE_WORKSPACE_RUNTIME_CONTRACT =
  "AVANTIQO_CODE_WORKSPACE_RUNTIME_V1";

const TARGETS = new Set(["SANDBOX", "LOCAL_COMPUTER", "DEVICE"]);
const DEVICE_SESSION_FALLBACK_TTL_MS = 5 * 60 * 1000;
const deviceSessionFallbackCache = new Map();

function text(value) {
  return String(value ?? "").trim();
}

export function resolveCodeWorkspaceTarget(value = null) {
  const requested = text(value || process.env.AVANTIQO_CODE_WORKSPACE_TARGET).toUpperCase();
  const target = requested || "SANDBOX";
  if (!TARGETS.has(target)) {
    throw new Error(`CODE_AI_WORKSPACE_TARGET_UNSUPPORTED:${target}`);
  }
  return target;
}

export async function codeWorkspaceRuntimeForTarget(value = null) {
  const target = resolveCodeWorkspaceTarget(value);
  if (target === "LOCAL_COMPUTER") {
    return import("./CodeWorkspaceLocalRuntime.js").then((module) => module.CodeWorkspaceLocalRuntime);
  }
  if (target === "DEVICE") {
    return import("./CodeWorkspaceDeviceRuntime.js").then((module) => module.CodeWorkspaceDeviceRuntime);
  }
  return import("./CodeWorkspaceSandboxRuntime.js").then((module) => module.CodeWorkspaceSandboxRuntime);
}

function recoverableMissingDeviceSession(error) {
  const message = text(error?.message || error).toUpperCase();
  return Boolean(
    message.includes("ENOENT") ||
    message.includes("CODE_AI_DEVICE_SESSION_ATTACH_INVALID") ||
    message.includes("CODE_AI_DEVICE_SESSION_NOT_FOUND") ||
    message.includes("CODE_AI_DEVICE_SESSION_MISSING")
  );
}

function transientDeviceControlPlaneFailure(error) {
  const message = text(error?.message || error).toLowerCase();
  const status = Number(error?.status ?? error?.statusCode ?? error?.error_code ?? error?.code);
  return Boolean(
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    (Number.isInteger(status) && status >= 500 && status <= 599) ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("ssl handshake") ||
    message.includes("cloudflare") ||
    message.includes("ssl_handshake_failed")
  );
}

function deviceSessionCacheKey(input = {}) {
  const organizationId = text(input.organization_id);
  const deviceId = text(input.device_id);
  const sessionId = text(input.session_id);
  return organizationId && deviceId && sessionId
    ? `${organizationId}:${deviceId}:${sessionId}`
    : null;
}

function rememberDeviceWorkspace(input, workspace) {
  const key = deviceSessionCacheKey({
    ...input,
    session_id: workspace?.session_id || input?.session_id,
  });
  if (!key || !workspace) return workspace;
  deviceSessionFallbackCache.set(key, {
    workspace,
    expires_at: Date.now() + DEVICE_SESSION_FALLBACK_TTL_MS,
  });
  return workspace;
}

function cachedDeviceWorkspace(input) {
  const key = deviceSessionCacheKey(input);
  if (!key) return null;
  const cached = deviceSessionFallbackCache.get(key);
  if (!cached) return null;
  if (Date.now() > Number(cached.expires_at || 0)) {
    deviceSessionFallbackCache.delete(key);
    return null;
  }
  return cached.workspace || null;
}

export async function openCodeWorkspace(input = {}) {
  const target = resolveCodeWorkspaceTarget(input.workspace_target);
  const runtime = await codeWorkspaceRuntimeForTarget(target);
  let workspace;
  if (target === "LOCAL_COMPUTER" && input.session_id && typeof runtime.attach === "function") {
    try {
      workspace = await runtime.attach(input);
    } catch (error) {
      if (
        !text(error?.message || error).includes("CODE_AI_LOCAL_SESSION_NOT_FOUND") ||
        !text(input.repository_url)
      ) {
        throw error;
      }
      workspace = await runtime.open({
        ...input,
        session_id: null,
      });
    }
  } else if (target === "DEVICE" && input.session_id && typeof runtime.attach === "function") {
    try {
      workspace = await runtime.attach(input);
      rememberDeviceWorkspace(input, workspace);
    } catch (error) {
      if (transientDeviceControlPlaneFailure(error)) {
        const cached = cachedDeviceWorkspace(input);
        if (cached) {
          workspace = cached;
        } else {
          throw error;
        }
      } else {
        if (!recoverableMissingDeviceSession(error) || !text(input.repository_url)) throw error;
        workspace = await runtime.open({
          ...input,
          session_id: null,
        });
        rememberDeviceWorkspace(input, workspace);
      }
    }
  } else {
    workspace = await runtime.open(input);
    if (target === "DEVICE") rememberDeviceWorkspace(input, workspace);
  }
  return {
    ...workspace,
    workspace_target: target,
    workspace_runtime_contract: runtime.contract,
  };
}


export async function bindCodeWorkspace(input = {}) {
  const target = resolveCodeWorkspaceTarget(input.workspace_target);
  const runtime = await codeWorkspaceRuntimeForTarget(target);
  if (target !== "DEVICE" || typeof runtime.bind !== "function") {
    throw new Error(`CODE_AI_WORKSPACE_BIND_UNSUPPORTED:${target}`);
  }
  const workspace = await runtime.bind(input);
  rememberDeviceWorkspace(input, workspace);
  return {
    ...workspace,
    workspace_target: target,
    workspace_runtime_contract: runtime.contract,
  };
}

export async function closeCodeWorkspaceSession(input = {}) {
  const target = resolveCodeWorkspaceTarget(input.workspace_target);
  const runtime = await codeWorkspaceRuntimeForTarget(target);
  if (typeof runtime.closeSession !== "function") {
    return {
      closed: false,
      unsupported: true,
      workspace_target: target,
    };
  }
  const result = await runtime.closeSession(input);
  return {
    ...result,
    workspace_target: target,
    workspace_runtime_contract: runtime.contract,
  };
}

export function codeWorkspaceCommandPolicy(input = {}, target = null) {
  const resolved = resolveCodeWorkspaceTarget(target);
  return resolved === "SANDBOX"
    ? codeWorkspaceUniversalCommandPolicy(input)
    : codeWorkspaceLocalCommandPolicy(input);
}

export const CodeWorkspaceRuntime = Object.freeze({
  contract: CODE_WORKSPACE_RUNTIME_CONTRACT,
  targets: [...TARGETS],
  resolveTarget: resolveCodeWorkspaceTarget,
  runtimeForTarget: codeWorkspaceRuntimeForTarget,
  open: openCodeWorkspace,
  bind: bindCodeWorkspace,
  closeSession: closeCodeWorkspaceSession,
  commandPolicy: codeWorkspaceCommandPolicy,
});

export default CodeWorkspaceRuntime;
