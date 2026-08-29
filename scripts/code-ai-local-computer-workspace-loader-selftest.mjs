import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CodeAILocalComputerWorkspaceLoader,
  resolve,
} from "./code-ai-local-computer-workspace-loader.mjs";

const CONTRACT = "AVANTIQO_CODE_AI_LOCAL_COMPUTER_WORKSPACE_LOADER_SELFTEST_V1";

const aliasUrl = CodeAILocalComputerWorkspaceLoader.resolveRepositoryAlias(
  "@/lib/shared/supabase/admin",
);
assert.ok(aliasUrl.startsWith("file:"), "ALIAS_MUST_RESOLVE_TO_FILE_URL");
assert.equal(
  path.basename(fileURLToPath(aliasUrl)),
  "admin.js",
  "SUPABASE_ADMIN_ALIAS_TARGET_REQUIRED",
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

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repository_root: CodeAILocalComputerWorkspaceLoader.repository_root,
  app_alias_resolution_verified: true,
  exact_failing_alias_verified: "@/lib/shared/supabase/admin",
  local_workspace_redirect_verified: true,
  delegated_resolution_preserved: true,
  provider_call_performed: false,
  reasoning_call_performed: false,
  wallet_mutation_performed: false,
  runpod_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
