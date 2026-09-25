import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const repository = fs.readFileSync("lib/creative/projects/repositories/CreativeProjectRepository.js", "utf8");
const runtime = fs.readFileSync("lib/creative/projects/runtime/CreativeProjectRuntime.js", "utf8");
const studio = fs.readFileSync("lib/creative/studio/CreativeStudioRuntime.js", "utf8");
const route = fs.readFileSync("app/api/creative/projects/route.js", "utf8");

test("creative project summary projection excludes multi-megabyte metadata", () => {
  const projection = repository.match(/const PROJECT_SUMMARY_SELECT = \[[\s\S]*?\]\.join\(","\);/)?.[0] || "";
  assert.ok(projection);
  assert.doesNotMatch(projection, /"metadata"/);
  assert.match(projection, /"creative_mission_id"/);
  assert.match(projection, /"name"/);
  assert.match(projection, /"status"/);
  assert.match(repository, /select\(PROJECT_SUMMARY_SELECT\)/);
});

test("Studio and project list API use summary reads while canonical deep reads remain available", () => {
  assert.match(runtime, /async listSummary/);
  assert.match(studio, /CreativeProjectRuntime\.listSummary\(/);
  assert.match(route, /CreativeProjectRuntime\.listSummary\(/);
  assert.match(repository, /export async function getById/);
  assert.match(repository, /select\("\*"\)/);
});
