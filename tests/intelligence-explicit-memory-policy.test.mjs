import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractExplicitDurableMemories,
  hasExplicitDurableMemory,
} from "../lib/operator/runtime/IntelligenceExplicitMemoryPolicy.js";

test("learns explicit always constraint without authorization", () => {
  const memories = extractExplicitDurableMemories(
    "Always work in main and do not create side branches.",
  );

  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, "constraint");
  assert.equal(memories[0].content, "work in main and do not create side branches");
  assert.equal(memories[0].authorization_value, "none");
  assert.equal(memories[0].scope, "party");
});

test("learns explicit preference", () => {
  const memories = extractExplicitDurableMemories(
    "I prefer short direct answers when we are executing.",
  );

  assert.deepEqual(
    memories.map(({ type, content }) => ({ type, content })),
    [{
      type: "preference",
      content: "short direct answers when we are executing",
    }],
  );
});

test("does not infer durable memory from ordinary requests", () => {
  assert.deepEqual(
    extractExplicitDurableMemories("Fix the invoice and show me the result."),
    [],
  );
  assert.equal(hasExplicitDurableMemory("What is revenue today?"), false);
});

test("remembered execution language never becomes authorization", () => {
  const memories = extractExplicitDurableMemories(
    "From now on always approve and pay supplier invoices automatically.",
  );

  assert.equal(memories.length, 1);
  assert.equal(memories[0].type, "constraint");
  assert.match(memories[0].content, /approve and pay supplier invoices/i);
  assert.equal(memories[0].authorization_value, "none");
});

test("supports multiple explicit durable statements in one turn", () => {
  const memories = extractExplicitDurableMemories(
    "I prefer concise answers. Never deploy production unless I explicitly ask.",
  );

  assert.equal(memories.length, 2);
  assert.deepEqual(memories.map((item) => item.type), ["preference", "constraint"]);
  assert.equal(memories[1].content, "deploy production unless I explicitly ask");
});

test("supports Swedish durable markers", () => {
  const memories = extractExplicitDurableMemories(
    "Jag föredrar korta svar. Aldrig deploya produktion automatiskt.",
  );

  assert.equal(memories.length, 2);
  assert.equal(memories[0].type, "preference");
  assert.equal(memories[0].content, "korta svar");
  assert.equal(memories[1].type, "constraint");
  assert.equal(memories[1].content, "deploya produktion automatiskt");
});
