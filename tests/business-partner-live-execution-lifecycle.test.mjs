import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const route = fs.readFileSync("app/api/operator/turn/live/route.js", "utf8");

test("every non-instant Business Partner turn begins a fresh live execution", () => {
  assert.match(route, /const codeInspection = codeInspectionRequest\(body\.message\)/);
  assert.match(route, /await beginAvantiqoLiveExecution\(\{/);
  assert.match(route, /lane: codeInspection \? "code" : "intelligence"/);
  assert.match(route, /I’m understanding your request and checking the current business context/);
});

test("code inspection adds specialized progress only after the fresh execution begins", () => {
  const begin = route.indexOf("await beginAvantiqoLiveExecution({");
  const routing = route.indexOf('phase: "CODE_INSPECTION_ROUTING"');
  assert.ok(begin >= 0);
  assert.ok(routing > begin);
});
