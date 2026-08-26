import { inspectCodeRepositoryIntelligence } from "../lib/code/runtime/CodeRepositoryIntelligenceRuntime.js";

const CONTRACT = "AVANTIQO_CODE_REPOSITORY_INTELLIGENCE_SELFTEST_V1";
const calls = [];
const workspace = {
  async inspect() {
    return { head_sha: "selftest", clean: true, package_manager: "unknown", tracked_file_count: 0, tracked_files_sample: [] };
  },
  async run(input) {
    calls.push({ command: input?.command, args: [...(input?.args || [])], cwd: input?.cwd });
    if (input?.command !== "git" || input?.args?.[0] !== "ls-files" || input?.args?.[1] !== "--") {
      throw new Error(`UNEXPECTED_DISCOVERY_COMMAND:${JSON.stringify(input)}`);
    }
    if (input.args.length > 80) throw new Error(`DISCOVERY_ARGUMENT_LIMIT_EXCEEDED:${input.args.length}`);
    return { exit_code: 0, stdout: "", stderr: "" };
  },
  async read() {
    throw new Error("DISCOVERY_SELFTEST_READ_SHOULD_NOT_RUN");
  },
};

const result = await inspectCodeRepositoryIntelligence(workspace);
const discovery = result.repository_intelligence;
function assert(condition, code, evidence = null) {
  if (!condition) throw new Error(`${code}:${JSON.stringify(evidence)}`);
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
console.log(`${CONTRACT}=PASS`);
