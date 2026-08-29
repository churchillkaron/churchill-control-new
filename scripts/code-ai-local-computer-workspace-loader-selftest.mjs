import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CodeAILocalComputerWorkspaceLoader,
  resolve,
} from "./code-ai-local-computer-workspace-loader.mjs";

const CONTRACT = "AVANTIQO_CODE_AI_LOCAL_COMPUTER_WORKSPACE_LOADER_SELFTEST_V3";

const aliasUrl = CodeAILocalComputerWorkspaceLoader.resolveRepositoryAlias(
  "@/lib/shared/supabase/admin",
);
assert.ok(aliasUrl.startsWith("file:"), "ALIAS_MUST_RESOLVE_TO_FILE_URL");
assert.equal(
  path.basename(fileURLToPath(aliasUrl)),
  "admin.js",
  "SUPABASE_ADMIN_ALIAS_TARGET_REQUIRED",
);

const adminParent = new URL("../lib/shared/supabase/admin.js", import.meta.url).href;
const extensionlessRelative = CodeAILocalComputerWorkspaceLoader.resolveRepositoryRelative(
  "./serverFetch",
  adminParent,
);
assert.ok(extensionlessRelative?.startsWith("file:"), "EXTENSIONLESS_RELATIVE_MUST_RESOLVE");
assert.equal(
  path.basename(fileURLToPath(extensionlessRelative)),
  "serverFetch.js",
  "SUPABASE_SERVER_FETCH_TARGET_REQUIRED",
);

const missionParent = new URL(
  "../lib/code/runtime/CodeAIMissionRuntime.js",
  import.meta.url,
).href;
const redirected = await resolve(
  "./CodeWorkspaceSandboxRuntime.js",
  { parentURL: missionParent },
  async () => {
    throw new Error("SANDBOX_REDIRECT_MUST_SHORT_CIRCUIT");
  },
);
assert.equal(
  redirected.url,
  CodeAILocalComputerWorkspaceLoader.shim_url,
  "LOCAL_COMPUTER_WORKSPACE_SHIM_REQUIRED",
);
assert.equal(redirected.shortCircuit, true);

const regular = await resolve(
  "node:path",
  { parentURL: import.meta.url },
  async (specifier) => ({ url: specifier, delegated: true }),
);
assert.deepEqual(regular, { url: "node:path", delegated: true });

const originalFetch = globalThis.fetch;
let networkCalls = 0;
globalThis.fetch = async () => {
  networkCalls += 1;
  throw new Error("CODE_AI_LOCAL_LOADER_SELFTEST_NETWORK_FORBIDDEN");
};
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-loader-selftest-service-role-key";

try {
  const adminModule = await import("@/lib/shared/supabase/admin");
  assert.ok(adminModule.supabaseAdmin, "SUPABASE_ADMIN_IMPORT_CHAIN_REQUIRED");

  const fastStartModule = await import("../lib/code/runtime/CodeAIEmployeeFastStartRuntime.js");
  assert.equal(
    typeof fastStartModule.executeCodeAIEmployeeFastStartMission,
    "function",
    "CODE_AI_FAST_START_RUNTIME_IMPORT_REQUIRED",
  );
  assert.equal(networkCalls, 0, "SELFTEST_IMPORTS_MUST_NOT_PERFORM_NETWORK_CALLS");
} finally {
  globalThis.fetch = originalFetch;
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repository_root: CodeAILocalComputerWorkspaceLoader.repository_root,
  app_alias_resolution_verified: true,
  exact_failing_alias_verified: "@/lib/shared/supabase/admin",
  extensionless_relative_resolution_verified: "./serverFetch -> serverFetch.js",
  admin_dependency_chain_import_verified: true,
  fast_start_dependency_chain_import_verified: true,
  safe_dummy_supabase_environment_used: true,
  real_environment_required_for_selftest: false,
  local_workspace_redirect_verified: true,
  delegated_resolution_preserved: true,
  network_call_performed: false,
  provider_call_performed: false,
  reasoning_call_performed: false,
  wallet_mutation_performed: false,
  runpod_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
