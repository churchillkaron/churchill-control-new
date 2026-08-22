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
  assert.equal(memories[0].content, "Always work in main and do not create side branches.");
  assert.equal(memories[0].revision_basis, "work in main and do not create side branches");
  assert.equal(memories[0].authorization_value, "none");
  assert.equal(memories[0].scope, "party");
});

test("learns explicit preference with semantic polarity preserved", () => {
  const memories = extractExplicitDurableMemories(
    "I prefer short direct answers when we are executing.",
  );

  assert.deepEqual(
    memories.map(({ type, content, revision_basis }) => ({ type, content, revision_basis })),
    [{
      type: "preference",
      content: "I prefer: short direct answers when we are executing.",
      revision_basis: null,
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
  assert.equal(
    memories[0].content,
    "From now on: always approve and pay supplier invoices automatically.",
  );
  assert.equal(memories[0].authorization_value, "none");
});

test("never polarity is never discarded from durable memory", () => {
  const memories = extractExplicitDurableMemories(
    "Never deploy production unless I explicitly ask.",
  );

  assert.equal(memories.length, 1);
  assert.equal(memories[0].content, "Never deploy production unless I explicitly ask.");
  assert.equal(memories[0].marker, "never");
});

test("opposite from-now-on directives share a revision basis", () => {
  const negative = extractExplicitDurableMemories(
    "From now on do not deploy production.",
  )[0];
  const positive = extractExplicitDurableMemories(
    "From now on deploy production.",
  )[0];

  assert.equal(negative.content, "From now on: do not deploy production.");
  assert.equal(positive.content, "From now on: deploy production.");
  assert.equal(negative.revision_basis, "deploy production");
  assert.equal(positive.revision_basis, "deploy production");
});

test("supports multiple explicit durable statements in one turn", () => {
  const memories = extractExplicitDurableMemories(
    "I prefer concise answers. Never deploy production unless I explicitly ask.",
  );

  assert.equal(memories.length, 2);
  assert.deepEqual(memories.map((item) => item.type), ["preference", "constraint"]);
  assert.equal(memories[0].content, "I prefer: concise answers.");
  assert.equal(memories[1].content, "Never deploy production unless I explicitly ask.");
});

test("supports Swedish durable markers without losing polarity", () => {
  const memories = extractExplicitDurableMemories(
    "Jag föredrar korta svar. Aldrig deploya produktion automatiskt.",
  );

  assert.equal(memories.length, 2);
  assert.equal(memories[0].type, "preference");
  assert.equal(memories[0].content, "Jag föredrar: korta svar.");
  assert.equal(memories[1].type, "constraint");
  assert.equal(memories[1].content, "Aldrig deploya produktion automatiskt.");
});
