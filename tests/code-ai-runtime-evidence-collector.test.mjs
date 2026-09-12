import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  collectCodeAIRuntimeEvidence,
  planCodeAIRuntimeEvidenceCollection,
} from "../lib/code/runtime/CodeAIRuntimeEvidenceCollectorRuntime.js";

function uiState() {
  return {
    repository_url: "https://github.com/example/repo",
    ref: "main",
    patch: "diff --git a/components/Card.jsx b/components/Card.jsx",
    files_changed: ["components/Card.jsx"],
  };
}

function apiState() {
  return {
    repository_url: "https://github.com/example/repo",
    ref: "main",
    patch: "diff --git a/app/api/orders/route.js b/app/api/orders/route.js",
    files_changed: ["app/api/orders/route.js"],
  };
}

const highRisk = { risk: "high" };

test("collector plans an observed UI E2E verifier without a model call", () => {
  const plan = planCodeAIRuntimeEvidenceCollection({
    state: uiState(),
    quality: highRisk,
    behavioral_verification: {
      observed_impacted_test_paths: ["e2e/card.browser.mjs"],
      matched_impacted_test_paths: [],
    },
  });
  assert.equal(plan.required, true);
  assert.equal(plan.applicable, true);
  assert.equal(plan.probes.length, 1);
  assert.equal(plan.probes[0].command, "node");
  assert.deepEqual(plan.probes[0].args, ["--test", "e2e/card.browser.mjs"]);
  assert.equal(plan.model_call_required, false);
  assert.equal(plan.commit_authority, false);
  assert.equal(plan.deploy_authority, false);
});

test("collector replays the final patch and records only passing runtime evidence", async () => {
  const calls = [];
  let stopped = false;
  const result = await collectCodeAIRuntimeEvidence({
    state: apiState(),
    quality: highRisk,
    behavioral_verification: {
      observed_impacted_test_paths: ["tests/orders.integration.mjs"],
      matched_impacted_test_paths: [],
    },
    openWorkspace: async (input) => {
      calls.push({ type: "open", input });
      return {
        run: async (input) => {
          calls.push({ type: "run", input });
          return { exit_code: 0, stdout: "orders API integration passed", stderr: "" };
        },
        stop: async () => { stopped = true; },
      };
    },
  });
  assert.equal(calls[0].input.resume_patch, apiState().patch);
  assert.equal(calls[1].input.command, "node");
  assert.equal(result.passed_probe_count, 1);
  assert.equal(result.failed_probe_count, 0);
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].kind, "api_integration");
  assert.equal(result.evidence[0].verified, true);
  assert.equal(result.evidence[0].provider_call_performed, false);
  assert.equal(stopped, true);
});

test("failed runtime probes remain diagnostic and cannot satisfy evidence coverage", async () => {
  const result = await collectCodeAIRuntimeEvidence({
    state: uiState(),
    quality: highRisk,
    behavioral_verification: {
      observed_impacted_test_paths: ["e2e/card.browser.mjs"],
    },
    openWorkspace: async () => ({
      run: async () => ({ exit_code: 1, stdout: "", stderr: "render failed" }),
      stop: async () => {},
    }),
  });
  assert.equal(result.collected, true);
  assert.equal(result.passed_probe_count, 0);
  assert.equal(result.failed_probe_count, 1);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.probe_results[0].exit_code, 1);
});

test("collector stays bounded to four observed probes", () => {
  const plan = planCodeAIRuntimeEvidenceCollection({
    state: uiState(),
    quality: highRisk,
    behavioral_verification: {
      observed_impacted_test_paths: Array.from({ length: 9 }, (_, index) => `e2e/card-${index}.browser.mjs`),
    },
  });
  assert.equal(plan.probes.length, 4);
});

test("employee controller collects deterministic runtime proof before spending another reasoning pass", async () => {
  const employee = await readFile("lib/code/runtime/CodeAIEmployeeRuntime.js", "utf8");
  const collector = await readFile("lib/code/runtime/CodeAIRuntimeEvidenceCollectorRuntime.js", "utf8");
  assert.match(employee, /collectDeterministicRuntimeEvidence/);
  assert.match(employee, /collectCodeAIRuntimeEvidence/);
  assert.match(employee, /runtime_evidence:/);
  assert.match(collector, /model_call_required: false/);
  assert.match(collector, /final_patch_replayed_in_isolated_workspace: true/);
  assert.match(collector, /commit_authority: false/);
  assert.match(collector, /deploy_authority: false/);
});

test("collector derives a static Next.js route for browser fallback when no E2E test exists", () => {
  const state = {
    repository_url: "https://github.com/example/repo",
    ref: "main",
    patch: "diff",
    files_changed: ["app/(system)/finance/invoices/page.jsx"],
  };
  const plan = planCodeAIRuntimeEvidenceCollection({
    state,
    quality: highRisk,
    behavioral_verification: { observed_impacted_test_paths: [] },
  });
  assert.equal(plan.browser_fallback, true);
  assert.deepEqual(plan.preview_routes, ["/finance/invoices"]);
  assert.equal(plan.applicable, true);
});

test("collector verifies the patched static route with a bounded agent-browser lifecycle", async () => {
  const state = {
    repository_url: "https://github.com/example/repo",
    ref: "main",
    patch: "diff",
    files_changed: ["app/(system)/finance/invoices/page.jsx"],
  };
  const commands = [];
  let serverKilled = false;
  let workspaceStopped = false;
  const result = await collectCodeAIRuntimeEvidence({
    state,
    quality: highRisk,
    behavioral_verification: { observed_impacted_test_paths: [] },
    openWorkspace: async () => ({
      startDetached: async (input) => {
        commands.push(["detached", input.command, ...input.args]);
        return { kill: async () => { serverKilled = true; } };
      },
      run: async (input) => {
        commands.push(["run", input.command, ...input.args]);
        if (input.command === "git") return { exit_code: 0, stdout: "package-lock.json\n", stderr: "" };
        if (input.command === "npm") return { exit_code: 0, stdout: "installed", stderr: "" };
        if (input.command === "node") return { exit_code: 0, stdout: "", stderr: "" };
        const joined = input.args.join(" ");
        if (joined.includes(" eval ") && joined.includes("HAS_CONTENT")) return { exit_code: 0, stdout: "HAS_CONTENT\n", stderr: "" };
        if (joined.includes(" eval ") && joined.includes("ERROR_OVERLAY")) return { exit_code: 0, stdout: "OK\n", stderr: "" };
        if (joined.includes(" snapshot ")) return { exit_code: 0, stdout: "button: Create invoice", stderr: "" };
        return { exit_code: 0, stdout: "OK", stderr: "" };
      },
      stop: async () => { workspaceStopped = true; },
    }),
  });
  assert.equal(result.passed_probe_count, 1);
  assert.equal(result.evidence[0].kind, "browser_preview");
  assert.equal(result.evidence[0].verified, true);
  assert.ok(commands.some((entry) => entry.includes("ci")));
  assert.ok(commands.some((entry) => entry.includes("dev")));
  assert.ok(commands.some((entry) => entry.includes("agent-browser") && entry.includes("open")));
  assert.ok(commands.some((entry) => entry.includes("agent-browser") && entry.includes("snapshot")));
  assert.ok(commands.some((entry) => entry.includes("agent-browser") && entry.includes("close")));
  assert.equal(serverKilled, true);
  assert.equal(workspaceStopped, true);
});

test("dynamic Next.js routes are not guessed for browser certification", () => {
  const plan = planCodeAIRuntimeEvidenceCollection({
    state: {
      repository_url: "https://github.com/example/repo",
      ref: "main",
      patch: "diff",
      files_changed: ["app/customers/[customerId]/page.jsx"],
    },
    quality: highRisk,
    behavioral_verification: { observed_impacted_test_paths: [] },
  });
  assert.equal(plan.browser_fallback, false);
  assert.deepEqual(plan.preview_routes, []);
  assert.equal(plan.applicable, false);
  assert.equal(plan.reason, "NO_DETERMINISTIC_RUNTIME_PROBE_AVAILABLE");
});
