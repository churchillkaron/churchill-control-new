import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url),
  "utf8",
);

test("settled master recovery precedes paid research on restart", () => {
  const recover = source.indexOf("let initialMaster = await recoverSettledInitialMaster");
  const guard = source.indexOf("if (!initialMaster)", recover);
  const research = source.indexOf("researched = await resolveCreativeDirectionResearch", guard);
  assert.ok(recover >= 0, "settled master recovery missing");
  assert.ok(guard > recover, "fresh-work guard must follow recovery");
  assert.ok(research > guard, "research must run only when recovery misses");
  assert.match(source, /research: researched\?\.research \|\| \{\}/);
  assert.match(source, /creative_learning: learned\?\.creative_learning \|\| null/);
});