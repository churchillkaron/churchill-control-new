import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const memory = fs.readFileSync("lib/operator/runtime/IntelligenceMemoryRuntime.js", "utf8");
const work = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageRuntime.js", "utf8");
const customer = fs.readFileSync("lib/code/runtime/CodeAICustomerArtifactRuntime.js", "utf8");

test("owner negative deployment instructions remain durable conversation constraints", () => {
  assert.match(memory, /constraints/);
  assert.match(memory, /projectState\?\.constraints/);
});

test("Code work cannot silently turn engineering approval into deployment authority", () => {
  assert.match(work, /This steering has no commit or deployment authority/);
  assert.match(customer, /deploy only when separately authorized and independently verified/);
  assert.match(customer, /No commit or deployment is implied by this result/);
});
