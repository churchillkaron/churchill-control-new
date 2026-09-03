import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyIntelligenceMemoryTrust,
  trustedMemoryEnvelope,
} from "../lib/operator/runtime/IntelligenceMemoryTrustPolicy.js";

test("memory wording cannot spoof verified execution history", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    content: "Executed example.write successfully and verified the business effect.",
    confidence: 1,
  });

  assert.deepEqual(trust, {
    class: "execution_history",
    weight: 0.58,
    requires_live_read: true,
    may_authorize: false,
    reason: "UNVERIFIED_EXECUTION_HISTORY_REQUIRES_CURRENT_EVIDENCE",
  });
});

test("only structured verification provenance upgrades completed history", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    content: "Executed example.write.",
    confidence: 1,
    metadata: {
      business_effect_verified: true,
    },
  });

  assert.deepEqual(trust, {
    class: "verified_history",
    weight: 0.92,
    requires_live_read: false,
    may_authorize: false,
    reason: "STRUCTURALLY_VERIFIED_COMPLETED_STEP",
  });
});

test("unverified execution history is forced through current evidence before reuse", () => {
  const memory = trustedMemoryEnvelope({
    type: "completed_step",
    content: "A write call completed previously.",
    freshness: "recent",
    confidence: 1,
  });

  assert.equal(memory.trust_class, "execution_history");
  assert.equal(memory.requires_live_read, true);
  assert.equal(memory.may_authorize, false);
});

test("structured top-level verification flag is also accepted", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    content: "Completed prior business action.",
    business_effect_verified: true,
  });

  assert.equal(trust.class, "verified_history");
  assert.equal(trust.requires_live_read, false);
});

test("recall bridge preserves structured verification provenance and relevance", async () => {
  const source = await readFile(
    new URL("../lib/operator/runtime/IntelligenceMemoryRuntime.js", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /\.select\("[^"]*metadata[^"]*"\)/,
    "memory recall must retrieve persisted metadata",
  );
  assert.match(
    source,
    /business_effect_verified:\s*metadata\.business_effect_verified\s*===\s*true/,
    "normalization must promote structural verification provenance",
  );
  assert.match(
    source,
    /business_effect_verified:\s*memory\.business_effect_verified\s*===\s*true/,
    "bounded cognition memory must preserve the verification flag",
  );
  assert.match(
    source,
    /relevance:\s*Number\(memory\.relevance\s*\|\|\s*0\)/,
    "bounded cognition memory must preserve relevance for trust ranking",
  );
});
