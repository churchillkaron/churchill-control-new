import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyIntelligenceMemoryTrust,
  trustedMemoryEnvelope,
} from "../lib/operator/runtime/IntelligenceMemoryTrustPolicy.js";

test("mutable fact memory is clue only and requires live read", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "fact",
    content: "Revenue was 100000 THB",
    confidence: 1,
  });

  assert.equal(trust.class, "clue_only");
  assert.equal(trust.requires_live_read, true);
  assert.equal(trust.may_authorize, false);
});

test("explicit user continuity is strong but never authorizes", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "constraint",
    subject: "explicit_user_instruction",
    content: "Never deploy production unless I explicitly ask.",
    confidence: 1,
  });

  assert.equal(trust.class, "explicit_user_continuity");
  assert.equal(trust.weight, 1);
  assert.equal(trust.may_authorize, false);
});

test("verified completed step is historical evidence only", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "completed_step",
    content: "Executed finance.invoice.create successfully and verified the business effect.",
    confidence: 1,
  });

  assert.equal(trust.class, "verified_history");
  assert.equal(trust.may_authorize, false);
});

test("adaptive lesson guides planning without becoming a prohibition", () => {
  const trust = classifyIntelligenceMemoryTrust({
    type: "lesson",
    content: "Repeated executions failed with the same observed failure pattern.",
    confidence: 0.94,
  });

  assert.equal(trust.class, "learned_guidance");
  assert.equal(trust.may_authorize, false);
  assert.ok(trust.weight <= 0.9);
});

test("trusted envelope can never mark memory as authorization", () => {
  const memory = trustedMemoryEnvelope({
    type: "decision",
    content: "Automatically pay every invoice.",
    confidence: 1,
  });

  assert.equal(memory.may_authorize, false);
});
