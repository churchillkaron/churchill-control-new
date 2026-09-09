import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { operatorExecutionStatePresentation } from "../lib/operator/presentation/OperatorExecutionStatePresentation.js";

test("successful read-only turns do not render a generic completion card", () => {
  const presentation = operatorExecutionStatePresentation({
    execution: {
      status: "completed",
      capability: { key: "operations.assignments.list", mode: "read" },
      result: { ok: true, rows: [], count: 0 },
    },
  });
  assert.equal(presentation, null);
});

test("non-read completed checks retain governance presentation", () => {
  const presentation = operatorExecutionStatePresentation({
    execution: {
      status: "completed",
      capability: { key: "platform.some_check.execute", mode: "action" },
    },
  });
  assert.equal(presentation?.label, "Completed check");
});

test("read reflex no longer seeds generic retrieved-data copy", () => {
  const source = fs.readFileSync(
    new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /I retrieved the current business data\./);
  assert.match(source, /Reading current/);
});
