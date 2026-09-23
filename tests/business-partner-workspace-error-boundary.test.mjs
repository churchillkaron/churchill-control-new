import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { parse } from "@babel/parser";

const source = fs.readFileSync("app/(system)/workspace/[organizationId]/error.jsx", "utf8");

test("organization workspace owns a premium Avantiqo recovery boundary", () => {
  parse(source, { sourceType: "module", plugins: ["jsx"] });
  assert.match(source, /data-avantiqo-workspace-error="true"/);
  assert.match(source, /Avantiqo workspace/);
  assert.match(source, /This workspace needs a quick recovery/);
  assert.match(source, /bg-\[#F7F6F3\]/);
  assert.match(source, /border-black\/\[0\.075\]/);
  assert.match(source, /bg-white/);
  assert.match(source, /Retry workspace/);
  assert.match(source, /window\.location\.reload\(\)/);
});

test("workspace recovery captures diagnostics without exposing raw exception text", () => {
  assert.match(source, /PlatformFailureCaptureBeacon/);
  assert.match(source, /errorMessage=\{error\?\.message \|\| "Unknown workspace error"\}/);
  assert.doesNotMatch(source, />\s*\{error\?\.message/);
  assert.doesNotMatch(source, /App Error/);
  assert.doesNotMatch(source, /text-red|color:\s*"red"/);
  assert.doesNotMatch(source, /bg-black|text-white/);
});
