import {
  CODE_AI_GUARDED_ACTION_IDENTITY_CONTRACT,
  CODE_AI_SEARCH_MODES,
  codeAIGuardedActionFingerprint,
  normalizeCodeAIGuardedActionInput,
} from "../lib/code/runtime/CodeAIAutonomyActionIdentity.js";

const CONTRACT = "AVANTIQO_CODE_AI_AUTONOMY_ACTION_IDENTITY_SELFTEST_V1";

function assert(condition, code, evidence = null) {
  if (!condition) throw new Error(`${code}:${JSON.stringify(evidence)}`);
}

const sameQuery = "example\\.(js|ts)$";
const fingerprints = Object.fromEntries(
  CODE_AI_SEARCH_MODES.map((mode) => [
    mode,
    codeAIGuardedActionFingerprint("search", {
      mode,
      query: sameQuery,
      paths: ["lib"],
      path_globs: ["lib/**/*.js"],
    }),
  ]),
);
assert(
  new Set(Object.values(fingerprints)).size === CODE_AI_SEARCH_MODES.length,
  "SEARCH_MODES_MUST_HAVE_DISTINCT_FINGERPRINTS",
  fingerprints,
);

const implicitLiteral = codeAIGuardedActionFingerprint("search", {
  query: "needle",
  paths: ["lib", "app"],
});
const explicitLiteral = codeAIGuardedActionFingerprint("search", {
  mode: "literal",
  query: "needle",
  paths: ["app", "lib", "app"],
});
assert(
  implicitLiteral === explicitLiteral,
  "LEGACY_SEARCH_INPUT_MUST_NORMALIZE_TO_LITERAL",
  { implicitLiteral, explicitLiteral },
);

const globFallback = codeAIGuardedActionFingerprint("search", {
  mode: "glob",
  query: "lib/**/*.js",
});
const globExplicit = codeAIGuardedActionFingerprint("search", {
  mode: "glob",
  query: "lib/**/*.js",
  path_globs: ["lib/**/*.js", "lib/**/*.js"],
});
assert(
  globFallback === globExplicit,
  "GLOB_QUERY_FALLBACK_MUST_MATCH_EXPLICIT_PATH_GLOB",
  { globFallback, globExplicit },
);

const pathBase = codeAIGuardedActionFingerprint("search", {
  mode: "path",
  query: "runtime",
});
const pathWithIrrelevantScopes = codeAIGuardedActionFingerprint("search", {
  mode: "path",
  query: "runtime",
  paths: ["lib"],
  path_globs: ["lib/**"],
});
assert(
  pathBase === pathWithIrrelevantScopes,
  "PATH_SEARCH_IDENTITY_MUST_IGNORE_UNUSED_SCOPE_FIELDS",
  { pathBase, pathWithIrrelevantScopes },
);

const normalizedGlob = normalizeCodeAIGuardedActionInput("search", {
  mode: "glob",
  path_globs: ["scripts/*.mjs", "lib/**/*.js", "scripts/*.mjs"],
});
assert(
  JSON.stringify(normalizedGlob.path_globs) === JSON.stringify(["lib/**/*.js", "scripts/*.mjs"]),
  "GLOB_PATHS_MUST_BE_DEDUPED_AND_SORTED",
  normalizedGlob,
);

const normalizedRead = normalizeCodeAIGuardedActionInput("read", {
  file_path: "lib/example.js",
  start_line: 5,
});
assert(
  normalizedRead.end_line === 404,
  "READ_DEFAULT_WINDOW_MUST_REMAIN_STABLE",
  normalizedRead,
);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  identity_contract: CODE_AI_GUARDED_ACTION_IDENTITY_CONTRACT,
  verified: {
    literal_regex_path_glob_fingerprints_are_distinct: true,
    legacy_search_defaults_to_literal: true,
    glob_query_fallback_matches_workspace_semantics: true,
    path_mode_ignores_unused_scope_fields: true,
    search_scope_lists_are_canonicalized: true,
    read_identity_default_window_preserved: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
