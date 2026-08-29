const MISSION_RUNTIME_SUFFIX = "/lib/code/runtime/CodeAIMissionRuntime.js";
const SANDBOX_SPECIFIER = "./CodeWorkspaceSandboxRuntime.js";
const SHIM_URL = new URL("./code-ai-local-computer-workspace-shim.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === SANDBOX_SPECIFIER &&
    String(context.parentURL || "").endsWith(MISSION_RUNTIME_SUFFIX)
  ) {
    return {
      url: SHIM_URL,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
