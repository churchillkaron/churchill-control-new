import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");
test("tribunal preserves a settled panel when review execution is interrupted", () => {
  assert.match(source, /let reviews;\n\s*try \{\n\s*reviews = await runReviews/);
  assert.match(source, /tribunalResumePackage\(\{\n\s*plan,\n\s*tribunal: \{/);
  assert.match(source, /error\.resume_package = error\.resume_package \|\| resumePackage/);
});
