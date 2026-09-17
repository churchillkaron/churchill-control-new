import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = "lib/intelligence/runtime";
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : entry.isFile() && /\.js$/.test(entry.name) ? [full] : [];
  });
}

test("intelligence runtimes never persist unsupported assessment memory type", () => {
  const violations = [];
  for (const file of files(root)) {
    const source = fs.readFileSync(file, "utf8");
    if (/memory_type\s*:\s*["']assessment["']/.test(source)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});
