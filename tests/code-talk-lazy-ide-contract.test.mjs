import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");

test("Talk does not reattach or poll the IDE until Code view is active", () => {
  assert.match(ide, /if \(embedded && studioView !== "code"\) return;/);
  assert.match(ide, /if \(!session \|\| \(embedded && studioView !== "code"\)\) return undefined/);
  assert.match(ide, /if \(!session \|\| \(embedded && studioView !== "code"\) \|\| !followCode/);
});

test("repository work still opens the workspace lazily from Talk", () => {
  assert.match(ide, /if \(!missionSession\) \{[\s\S]*missionSession = await openWorkspace\(\)/);
});
