import { readFile, writeFile } from "node:fs/promises";

const runtimePath = "lib/code/runtime/CodeRepositoryIntelligenceRuntime.js";
let source = await readFile(runtimePath, "utf8");

const constantMarker = "const MAX_BUILD_SYSTEM_CONVENTIONS = 120;\n";
if (!source.includes("const DISCOVERY_PATHSPEC_BATCH_SIZE = 60;")) {
  if (!source.includes(constantMarker)) throw new Error("CODE_DISCOVERY_BATCH_CONSTANT_MARKER_MISSING");
  source = source.replace(
    constantMarker,
    `${constantMarker}const DISCOVERY_PATHSPEC_BATCH_SIZE = 60;\n`,
  );
}

if (!source.includes("const outputs = [];\n  let batchCount = 0;")) {
  const start = source.indexOf("async function discoverPaths(workspace) {");
  const boundary = source.indexOf("  const prioritized = [...allPaths].sort(", start);
  if (start < 0 || boundary < 0) throw new Error("CODE_DISCOVERY_FUNCTION_BOUNDARY_MISSING");
  const replacement = `async function discoverPaths(workspace) {
  const outputs = [];
  let batchCount = 0;
  for (
    let offset = 0;
    offset < DISCOVERY_PATHSPECS.length;
    offset += DISCOVERY_PATHSPEC_BATCH_SIZE
  ) {
    const pathspecBatch = DISCOVERY_PATHSPECS.slice(
      offset,
      offset + DISCOVERY_PATHSPEC_BATCH_SIZE,
    );
    const result = await workspace.run({
      command: "git",
      args: ["ls-files", "--", ...pathspecBatch],
      cwd: ".",
    });
    batchCount += 1;
    if (result.exit_code !== 0) {
      const error = new Error(
        \`CODE_AI_REPOSITORY_INTELLIGENCE_DISCOVERY_FAILED:\${result.exit_code}:batch=\${batchCount}\`,
      );
      error.details = {
        ...result,
        discovery_batch: batchCount,
        discovery_pathspec_count: pathspecBatch.length,
      };
      throw error;
    }
    outputs.push(String(result.stdout || ""));
  }
  const allPaths = unique(outputs.join("\\n").split("\\n"));
`;
  source = source.slice(0, start) + replacement + source.slice(boundary);
}

if (!source.includes("discovery_batches: batchCount")) {
  const marker = "    truncated: allPaths.length > MAX_DISCOVERED_PATHS,\n  };";
  if (!source.includes(marker)) throw new Error("CODE_DISCOVERY_RETURN_MARKER_MISSING");
  source = source.replace(
    marker,
    "    truncated: allPaths.length > MAX_DISCOVERED_PATHS,\n    discovery_batches: batchCount,\n  };",
  );
}

if (!source.includes("discovery_batch_count: discovered.discovery_batches")) {
  const marker = "      discovered_policy_and_convention_path_count: discovered.discovered_count,\n      discovery_truncated: discovered.truncated,";
  if (!source.includes(marker)) throw new Error("CODE_DISCOVERY_EXPORT_MARKER_MISSING");
  source = source.replace(
    marker,
    "      discovered_policy_and_convention_path_count: discovered.discovered_count,\n      discovery_batch_count: discovered.discovery_batches,\n      discovery_truncated: discovered.truncated,",
  );
}
await writeFile(runtimePath, source);

await writeFile(
  "scripts/code-ai-repository-intelligence-selftest.mjs",
  `import { inspectCodeRepositoryIntelligence } from "../lib/code/runtime/CodeRepositoryIntelligenceRuntime.js";

const CONTRACT = "AVANTIQO_CODE_REPOSITORY_INTELLIGENCE_SELFTEST_V1";
const calls = [];
const workspace = {
  async inspect() {
    return { head_sha: "selftest", clean: true, package_manager: "unknown", tracked_file_count: 0, tracked_files_sample: [] };
  },
  async run(input) {
    calls.push({ command: input?.command, args: [...(input?.args || [])], cwd: input?.cwd });
    if (input?.command !== "git" || input?.args?.[0] !== "ls-files" || input?.args?.[1] !== "--") {
      throw new Error(\`UNEXPECTED_DISCOVERY_COMMAND:\${JSON.stringify(input)}\`);
    }
    if (input.args.length > 80) throw new Error(\`DISCOVERY_ARGUMENT_LIMIT_EXCEEDED:\${input.args.length}\`);
    return { exit_code: 0, stdout: "", stderr: "" };
  },
  async read() {
    throw new Error("DISCOVERY_SELFTEST_READ_SHOULD_NOT_RUN");
  },
};

const result = await inspectCodeRepositoryIntelligence(workspace);
const discovery = result.repository_intelligence;
function assert(condition, code, evidence = null) {
  if (!condition) throw new Error(\`\${code}:\${JSON.stringify(evidence)}\`);
}
assert(calls.length >= 2, "DISCOVERY_MUST_BATCH_MORE_THAN_80_PATHSPECS", calls);
assert(calls.every((entry) => entry.args.length <= 80), "DISCOVERY_BATCH_MUST_RESPECT_SANDBOX_ARGUMENT_LIMIT", calls);
assert(calls.every((entry) => entry.args.length <= 62), "DISCOVERY_BATCH_SIZE_MUST_REMAIN_BOUNDED", calls);
assert(discovery.discovery_batch_count === calls.length, "DISCOVERY_BATCH_COUNT_MUST_BE_REPORTED", discovery);
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    oversized_internal_pathspec_inventory_is_batched: true,
    sandbox_command_argument_limit_preserved: true,
    each_discovery_batch_stays_below_limit: true,
    discovery_batch_count_reported: true,
    provider_calls_executed: false,
    provider_spend_performed: false,
    runpod_lease_opened: false,
    production_deploy_performed: false,
  },
}, null, 2));
console.log(\`\${CONTRACT}=PASS\`);
`,
);

const auditPath = "scripts/code-ai-repository-mutation-audit.mjs";
let audit = await readFile(auditPath, "utf8");
if (!audit.includes('  "DISCOVERY_PATHSPEC_BATCH_SIZE",\n')) {
  const marker = '  "monorepo",\n';
  if (!audit.includes(marker)) throw new Error("CODE_DISCOVERY_AUDIT_MARKER_MISSING");
  audit = audit.replace(marker, `${marker}  "DISCOVERY_PATHSPEC_BATCH_SIZE",\n  "discovery_batch_count",\n`);
}
if (!audit.includes("    discovery_pathspecs_batched_below_sandbox_argument_limit: true,\n")) {
  const marker = "    nested_build_commands_bound_to_working_directory: true,\n";
  if (!audit.includes(marker)) throw new Error("CODE_DISCOVERY_AUDIT_VERIFIED_MARKER_MISSING");
  audit = audit.replace(marker, `${marker}    discovery_pathspecs_batched_below_sandbox_argument_limit: true,\n`);
}
await writeFile(auditPath, audit);

const packagePath = "package.json";
let packageSource = await readFile(packagePath, "utf8");
const oldScript = '"audit:code-repository-mutations": "node scripts/code-ai-repository-mutation-audit.mjs && node scripts/code-ai-source-change-selftest.mjs"';
const newScript = '"audit:code-repository-mutations": "node scripts/code-ai-repository-mutation-audit.mjs && node scripts/code-ai-repository-intelligence-selftest.mjs && node scripts/code-ai-source-change-selftest.mjs"';
if (packageSource.includes(oldScript)) {
  packageSource = packageSource.replace(oldScript, newScript);
} else if (!packageSource.includes(newScript)) {
  throw new Error("CODE_DISCOVERY_PACKAGE_SCRIPT_MARKER_MISSING");
}
await writeFile(packagePath, packageSource);

console.log("AVANTIQO_CODE_REPOSITORY_DISCOVERY_BATCH_PATCH=READY");
