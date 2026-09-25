import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { resolvePreSemanticReadIntent } from "../lib/operator/runtime/OperatorPreSemanticReadRuntime.js";

test("registered write intent cannot be hijacked by presemantic read matching", () => {
  const correction = resolvePreSemanticReadIntent({
    message: "change the last customer invoice",
    immediateConversation: [],
  });
  assert.equal(correction, null);
});

test("plain read requests can still use the presemantic read lane", () => {
  const read = resolvePreSemanticReadIntent({
    message: "show customer invoices",
    immediateConversation: [],
  });
  assert.ok(read);
  assert.equal(read.requires_mutation, false);
  assert.equal(read.presemantic_read_match, true);
});

test("unsafe preflight candidates are explicitly cleared before historical-context decision", () => {
  const source = fs.readFileSync("app/api/operator/turn/route.js", "utf8");
  assert.match(
    source,
    /if \(selfContained \|\| immediateContextSufficient\)[\s\S]*else \{\s*preflightSemanticUnderstanding = null;/,
  );
  const clearIndex = source.indexOf("preflightSemanticUnderstanding = null;", source.indexOf("if (selfContained || immediateContextSufficient)"));
  const skipIndex = source.indexOf("const skipHistoricalContext = Boolean(preflightSemanticUnderstanding);");
  assert.ok(clearIndex >= 0 && skipIndex > clearIndex);
});
