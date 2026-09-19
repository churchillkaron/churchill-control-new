import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const allowed = new Set(["goal","decision","constraint","preference","fact","lesson","completed_step","blocker","relationship"]);

test("intelligence runtimes persist only live DB-supported memory types", () => {
  const dir = "lib/intelligence/runtime";
  const invalid = [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(path.join(dir,file),"utf8");
    for (const match of source.matchAll(/memory_type\s*:\s*"([^"]+)"/g)) {
      if (!allowed.has(match[1])) invalid.push(`${file}:${match[1]}`);
    }
  }
  assert.deepEqual(invalid, []);
});
