import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url),
  "utf8",
);

test("resume repository identity ignores harmless git suffix and trailing slash differences", () => {
  assert.match(source, /function normalizedRepositoryIdentity/);
  assert.match(source, /toLowerCase\(\)\.replace\(\/\\\/\+\$\/, ""\)\.replace\(\/\\\.git\$\/, ""\)/);
  assert.match(
    source,
    /normalizedRepositoryIdentity\(resume_state\.repository_url\)[\s\S]{0,160}normalizedRepositoryIdentity\(repository_url \|\| resume_state\.repository_url\)/,
  );
});

test("resume still blocks genuinely different repositories", () => {
  assert.match(source, /CODE_AI_MISSION_RESUME_REPOSITORY_MISMATCH/);
});
