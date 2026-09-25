import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const access = await readFile(new URL("../lib/platform/security/requireOrganizationAccess.js", import.meta.url), "utf8");

test("active Code IDE state polling converges quickly without overlapping requests", () => {
  assert.match(ide, /missionRunning \|\| sessionAgentActive\)\s*\? 2000/);
  assert.match(ide, /studioView === "code"\s*\? 5000/);
});

test("revision refresh uses state then parallel tree and diff without duplicate follow-Code reads", () => {
  const start = ide.indexOf('if (nextRevision !== revision)');
  const block = ide.slice(start, start + 1800);
  assert.match(block, /Promise\.all\(\[\s*ideRequest\("tree"\),\s*ideRequest\("diff"\)/);
  assert.match(block, /if \(followCode && changedPath && !Object\.values\(dirty\)\.some\(Boolean\)\)/);
  assert.match(block, /else if \(!followCode && activePath && !dirty\[activePath\]\)/);
});

test("localhost Code access keeps the existing longer authorization hot cache", () => {
  assert.match(access, /LOCAL_CODE_ACCESS_HOT_CACHE_TTL_MS = 60 \* 1000/);
  assert.match(access, /localCodeAccessRequest\(request\)/);
});
