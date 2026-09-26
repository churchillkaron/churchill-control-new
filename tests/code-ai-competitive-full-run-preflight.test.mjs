import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assessCodeAICompetitiveFullRunPreflight,
  codeAICompetitiveProviderCredentialPresent,
} from "../lib/code/runtime/CodeAICompetitiveFullRunPreflightRuntime.js";

const sources = [
  { label: "A", path: "/a", exists: true },
  { label: "B", path: "/b", exists: true },
];

test("provider credential preflight supports OpenAI Anthropic and Google aliases without exposing values", () => {
  const env = { OPENAI_API_KEY: "secret-a", ANTHROPIC_API_KEY: "secret-b", GOOGLE_API_KEY: "secret-c" };
  assert.equal(codeAICompetitiveProviderCredentialPresent("openai", env), true);
  assert.equal(codeAICompetitiveProviderCredentialPresent("anthropic", env), true);
  assert.equal(codeAICompetitiveProviderCredentialPresent("google", env), true);
  assert.equal(codeAICompetitiveProviderCredentialPresent("gemini", env), true);
  const result = assessCodeAICompetitiveFullRunPreflight({
    providers: ["openai", "anthropic", "google"], env, source_files: sources, evidence_root_writable: true,
  });
  assert.equal(result.success, true);
  assert.deepEqual(result.credentials, { anthropic: "PRESENT", google: "PRESENT", openai: "PRESENT" });
  assert.equal(JSON.stringify(result).includes("secret-"), false);
  assert.equal(result.credential_values_exposed, false);
  assert.equal(result.provider_calls_executed, false);
});

test("preflight fails before execution when any configured provider credential is missing", () => {
  const result = assessCodeAICompetitiveFullRunPreflight({
    providers: ["openai", "google"], env: { OPENAI_API_KEY: "present" }, source_files: sources, evidence_root_writable: true,
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.missing_provider_credentials, ["google"]);
});

test("preflight fails closed on missing source or unwritable evidence root", () => {
  const result = assessCodeAICompetitiveFullRunPreflight({
    providers: ["openai"], env: { OPENAI_API_KEY: "present" },
    source_files: [...sources, { label: "MISSING_SUITE", path: "/missing", exists: false }],
    evidence_root_writable: false,
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.missing_source_files, ["MISSING_SUITE"]);
  assert.equal(result.evidence_root_writable, false);
});

test("full orchestrator runs zero-call preflight before every benchmark child stage", async () => {
  const source = await readFile("scripts/run-avantiqo-code-competitive-full-live.mjs", "utf8");
  const preflightIndex = source.indexOf("const livePreflight = await runLivePreflight()");
  const firstChildIndex = source.indexOf('runNode("scripts/run-avantiqo-code-frontier-local.mjs"');
  assert.ok(preflightIndex > 0);
  assert.ok(firstChildIndex > preflightIndex);
  assert.match(source, /missing_provider_credentials/);
  assert.match(source, /evidence_root_writable/);
  assert.match(source, /live_preflight_required: true/);
});
