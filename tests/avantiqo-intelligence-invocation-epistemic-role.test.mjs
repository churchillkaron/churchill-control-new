import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AvantiqoInvocationEpistemicRoleRuntime,
  resolveAvantiqoInvocationEpistemicRoles,
} from "../lib/intelligence/runtime/AvantiqoInvocationEpistemicRoleRuntime.mjs";

const reasoningLoop = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url),
  "utf8",
);

test("invocation epistemic role resolver exposes the canonical contract", () => {
  assert.equal(
    AvantiqoInvocationEpistemicRoleRuntime.contract,
    "AVANTIQO_INVOCATION_EPISTEMIC_ROLE_V1",
  );
  assert.equal(
    AvantiqoInvocationEpistemicRoleRuntime.governance.authorization_effect,
    "NONE",
  );
  assert.equal(
    AvantiqoInvocationEpistemicRoleRuntime.governance.capability_key_exact_match_required,
    true,
  );
});

test("ordinary operator live reads are live-read evidence only", () => {
  const roles = resolveAvantiqoInvocationEpistemicRoles({
    tool_name: "operator_live_read",
    capability_key: "finance.general_ledger.read",
  });

  assert.deepEqual(roles, ["live_read"]);
});

test("canonical governed research reads carry live-read and research roles", () => {
  for (const capabilityKey of [
    "platform.research.search",
    "platform.research_source.read",
    "platform.research_compare.analyze",
  ]) {
    const roles = resolveAvantiqoInvocationEpistemicRoles({
      tool_name: "operator_live_read",
      capability_key: capabilityKey,
    });

    assert.equal(roles.includes("live_read"), true);
    assert.equal(roles.includes("research"), true);
  }
});

test("research role cannot be spoofed with a research-like arbitrary capability key", () => {
  const roles = resolveAvantiqoInvocationEpistemicRoles({
    tool_name: "operator_live_read",
    capability_key: "platform.research.fake",
  });

  assert.deepEqual(roles, ["live_read"]);
});

test("existing governed static roles remain intact", () => {
  const roles = resolveAvantiqoInvocationEpistemicRoles({
    tool_name: "verification_read",
    capability_key: "anything",
    static_roles: ["verification"],
  });

  assert.deepEqual(roles, ["verification"]);
});

test("reasoning loop applies invocation roles before marginal research tracking", () => {
  assert.match(reasoningLoop, /resolveAvantiqoInvocationEpistemicRoles/);
  assert.match(reasoningLoop, /function invocationEpistemicRoles/);
  assert.match(reasoningLoop, /capability_key:\s*object\(args\)\.capability_key/);
  assert.match(reasoningLoop, /const invocationRoles = invocationEpistemicRoles/);
  assert.match(
    reasoningLoop,
    /toolOutcome\(result\) === "succeeded" && invocationRoles\.includes\("research"\)/,
  );
  assert.match(reasoningLoop, /epistemicRoles:\s*invocationRoles/);
});
