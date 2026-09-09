import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { organizationalContextResponseText } from "../lib/operator/runtime/OperatorTurnRuntimeCore.js";

const result = {
  result: {
    organization: { name: "Cole Ley Co., Ltd.", status: "active", organization_type: "direct_business", industry: "artist-agency" },
    legal_entity: { legal_name: "Cole Ley Co., Ltd.", is_active: true, is_default_accounting_entity: true, country: "TH", currency: "THB", timezone: "Asia/Bangkok" },
    registered_industries: ["entertainment"],
  },
};

test("organizational-context response states verified organization and selected legal entity", () => {
  const text = organizationalContextResponseText(result);
  assert.match(text, /Current organization: Cole Ley Co\., Ltd\./);
  assert.match(text, /Current legal entity: Cole Ley Co\., Ltd\./);
  assert.match(text, /currency THB/);
  assert.match(text, /timezone Asia\/Bangkok/);
  assert.match(text, /Registered industries: entertainment/);
  assert.match(text, /No business data was changed/);
  assert.doesNotMatch(text, /I retrieved the current business data/);
});

test("organizational-context execution bypasses AI verification synthesis", () => {
  const source = fs.readFileSync(new URL("../lib/operator/runtime/OperatorTurnRuntimeCore.js", import.meta.url), "utf8");
  const branch = source.indexOf("if (capability.key === ORGANIZATIONAL_CONTEXT_KEY)");
  const verification = source.indexOf("let verifiedDecision = decision");
  assert.ok(branch >= 0);
  assert.ok(verification > branch);
  const segment = source.slice(branch, verification);
  assert.match(segment, /organizational-context-result-renderer-v1/);
  assert.doesNotMatch(segment, /verifyOperatorExecution\s*\(/);
});
