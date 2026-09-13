import assert from "node:assert/strict";
import test from "node:test";
import {
  boundLongTermMemoryContext,
  boundRecentConversationTurns,
  estimateContextTokens,
} from "../lib/operator/runtime/IntelligenceMemoryGovernorPolicy.js";

test("recent conversation keeps newest turns and restores chronological order", () => {
  const newestFirst = Array.from({ length: 24 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `turn-${24 - index}`,
  }));
  const bounded = boundRecentConversationTurns(newestFirst, {
    maxItems: 12,
    maxTokens: 1000,
    maxBytes: 10000,
  });
  assert.equal(bounded.length, 12);
  assert.equal(bounded[0].content, "turn-13");
  assert.equal(bounded.at(-1).content, "turn-24");
});

test("conversation context is bounded by bytes as well as turn count", () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    role: "user",
    content: `${index}:` + "x".repeat(3000),
  }));
  const bounded = boundRecentConversationTurns(rows, {
    maxItems: 12,
    maxTokens: 10000,
    maxBytes: 5000,
    maxItemTokens: 2000,
  });
  const bytes = bounded.reduce(
    (total, item) => total + Buffer.byteLength(item.content, "utf8"),
    0,
  );
  assert.ok(bytes <= 5000);
});

test("memory context remains bounded when durable memory grows", () => {
  const memories = Array.from({ length: 1000 }, (_, index) => ({
    type: "decision",
    content: `memory-${index} ` + "important ".repeat(200),
    relevance: 1 - index / 2000,
  }));
  const bounded = boundLongTermMemoryContext(memories);
  const bytes = bounded.reduce(
    (total, item) => total + Buffer.byteLength(item.content, "utf8"),
    0,
  );
  const tokens = bounded.reduce(
    (total, item) => total + estimateContextTokens(item.content),
    0,
  );
  assert.ok(bounded.length <= 12);
  assert.ok(bytes <= 12000);
  assert.ok(tokens <= 2400);
});

test("multibyte text is bounded conservatively", () => {
  const thai = "ระบบอัจฉริยะธุรกิจ ".repeat(1000);
  const bounded = boundLongTermMemoryContext(
    [{ type: "decision", content: thai }],
    { maxItems: 1, maxTokens: 100, maxBytes: 400, maxItemTokens: 100 },
  );
  assert.equal(bounded.length, 1);
  assert.ok(Buffer.byteLength(bounded[0].content, "utf8") <= 300);
  assert.ok(estimateContextTokens(bounded[0].content) <= 100);
});
