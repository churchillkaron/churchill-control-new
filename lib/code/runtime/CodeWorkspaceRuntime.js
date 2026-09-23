import { CodeWorkspaceSandboxRuntime } from "./CodeWorkspaceSandboxRuntime.js";
import { CodeWorkspaceLocalRuntime } from "./CodeWorkspaceLocalRuntime.js";
import { CodeWorkspaceDeviceRuntime } from "./CodeWorkspaceDeviceRuntime.js";

export const CODE_WORKSPACE_RUNTIME_CONTRACT =
  "AVANTIQO_CODE_WORKSPACE_RUNTIME_V1";

const TARGETS = new Set(["SANDBOX", "LOCAL_COMPUTER", "DEVICE"]);

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

export function codeWorkspaceRuntimeForTarget(value = null) {
  const target = resolveCodeWorkspaceTarget(value);
  if (target === "LOCAL_COMPUTER") return CodeWorkspaceLocalRuntime;
  if (target === "DEVICE") return CodeWorkspaceDeviceRuntime;
  return CodeWorkspaceSandboxRuntime;
}

export async function openCodeWorkspace(input = {}) {
  const target = resolveCodeWorkspaceTarget(input.workspace_target);
  const runtime = codeWorkspaceRuntimeForTarget(target);
  const workspace = target === "DEVICE" && input.session_id && typeof runtime.attach === "function"
    ? await runtime.attach(input)
    : await runtime.open(input);
  return {
    ...workspace,
    workspace_target: target,
    workspace_runtime_contract: runtime.contract,
  };
}


export async function bindCodeWorkspace(input = {}) {
  const target = resolveCodeWorkspaceTarget(input.workspace_target);
  const runtime = codeWorkspaceRuntimeForTarget(target);
  if (target !== "DEVICE" || typeof runtime.bind !== "function") {
    throw new Error(`CODE_AI_WORKSPACE_BIND_UNSUPPORTED:${target}`);
  }
  const workspace = await runtime.bind(input);
  return {
    ...workspace,
    workspace_target: target,
    workspace_runtime_contract: runtime.contract,
  };
}

export function codeWorkspaceCommandPolicy(input = {}, target = null) {
  return codeWorkspaceRuntimeForTarget(target).commandPolicy(input);
}

export const CodeWorkspaceRuntime = Object.freeze({
  contract: CODE_WORKSPACE_RUNTIME_CONTRACT,
  targets: [...TARGETS],
  resolveTarget: resolveCodeWorkspaceTarget,
  runtimeForTarget: codeWorkspaceRuntimeForTarget,
  open: openCodeWorkspace,
  bind: bindCodeWorkspace,
  commandPolicy: codeWorkspaceCommandPolicy,
});

export default CodeWorkspaceRuntime;
