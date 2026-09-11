import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js","utf8");
test("company research preserves an explicit organization identity lane",()=>{
  assert.match(source,/\[identity, objective\]/);
  assert.match(source,/planObjective\("company_truth"\)/);
  assert.match(source,/planObjective\("brand_reputation"\)/);
});
