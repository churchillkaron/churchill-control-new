import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const wrapper = fs.readFileSync(
  new URL("../scripts/benchmark-avantiqo-intelligence.mjs", import.meta.url),
  "utf8",
);
const benchmark = fs.readFileSync(
  new URL("../scripts/avantiqo-intelligence-benchmark.mjs", import.meta.url),
  "utf8",
);
const provider = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js",
    import.meta.url,
  ),
  "utf8",
);
const registration = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProviderRegistration.js",
    import.meta.url,
  ),
  "utf8",
);
const packageJson = fs.readFileSync(
  new URL("../package.json", import.meta.url),
  "utf8",
);

test("Qwen3 parser and tool parser contract remain pinned", () => {
  assert.match(registration, /REASONING_PARSER:\s*"qwen3"/);
  assert.match(registration, /ENABLE_AUTO_TOOL_CHOICE:\s*"true"/);
  assert.match(registration, /TOOL_CALL_PARSER:\s*"hermes"/);
});

test("reasoning parser boundary rejects leaks and truncation", () => {
  assert.match(provider, /AVANTIQO_INTELLIGENCE_TRUNCATED_REASONING_OUTPUT/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_REASONING_LEAK_DETECTED/);
  assert.match(provider, /AVANTIQO_INTELLIGENCE_TOOL_CALL_PARSER_REQUIRED/);
});

test("benchmark embeds a trace without changing provider transport schema", () => {
  assert.match(benchmark, /AVANTIQO_CERTIFICATION_TRACE_ID=/);
  assert.match(benchmark, /tracedMessages/);
  assert.doesNotMatch(benchmark, /metadata:\s*\{/);
  assert.match(benchmark, /AVANTIQO_INTELLIGENCE_BENCHMARK_OUTPUT/);
});

test("deep strategy cognition is natural and JSON is only a boundary compile", () => {
  assert.match(benchmark, /NATURAL_REASONING_THEN_MACHINE_BOUNDARY_COMPILE/);
  assert.match(benchmark, /Do not output JSON, a schema, or private chain-of-thought/);
  assert.match(benchmark, /response_format_used:\s*false/);
  assert.match(benchmark, /contract_compile/);
  assert.match(benchmark, /response_format:\s*\{\s*type:\s*"json_object"\s*\}/);
  assert.match(benchmark, /tools_used:\s*false/);
});

test("strategic compiler preserves evidence gaps and exact contract", () => {
  assert.match(benchmark, /exactKeys\(parsed, \["decision", "rationale", "next_steps"\]\)/);
  assert.match(benchmark, /acknowledges_missing_guest_count/);
  assert.match(benchmark, /Preserve missing-evidence statements/);
});

test("certification refuses pre-existing work and never purges a shared queue", () => {
  assert.match(wrapper, /INTELLIGENCE_CERTIFICATION_REFUSES_PREEXISTING_NONTERMINAL_REQUESTS/);
  assert.match(wrapper, /INTELLIGENCE_CERTIFICATION_REQUIRES_WARM_QUIESCENT_ENDPOINT/);
  assert.doesNotMatch(wrapper, /purge-queue/);
});

test("cleanup may cancel only requests carrying its own trace", () => {
  assert.match(wrapper, /hasTrace\(request, traceId\)/);
  assert.match(wrapper, /cleanup_only_own_traced_requests:\s*true/);
  assert.match(wrapper, /foreign_requests_touched:\s*0/);
  assert.match(wrapper, /foreign_nonterminal_detected/);
});

test("local certification commands load .env.local and never deploy", () => {
  assert.match(packageJson, /benchmark:intelligence:local/);
  assert.match(packageJson, /benchmark:owned:local/);
  assert.match(packageJson, /--env-file=\.env\.local/);
  assert.doesNotMatch(packageJson, /benchmark:intelligence:local[^\n]*vercel\s+(--prod|deploy)/);
});

test("intelligence certification cannot activate pricing or routing", () => {
  assert.match(wrapper, /pricing_activation_performed:\s*false/);
  assert.match(wrapper, /provider_selection_changed:\s*false/);
  assert.match(wrapper, /activation_allowed:\s*false/);
  assert.match(benchmark, /pricing_activation_performed:\s*false/);
  assert.match(benchmark, /provider_selection_changed:\s*false/);
  assert.match(benchmark, /activation_allowed:\s*false/);
});
