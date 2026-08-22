import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../lib/platform/service-runtime/providers/openai/OpenAIProviderSanitizedRuntime.js", import.meta.url),
  "utf8",
);

test("gpt-image-1 auto dimensions become deterministic pricing defaults", () => {
  assert.match(source, /function isExactGptImage1\(model = ""\)/);
  assert.match(source, /fallback: "medium"/);
  assert.match(source, /fallback: "1024x1024"/);
  assert.match(source, /deterministic_pricing_dimensions: isExactGptImage1\(model\)/);
});

test("gpt-image-1 quality and size fail closed outside priced matrix", () => {
  assert.match(source, /allowed: \["low", "medium", "high"\]/);
  assert.match(source, /allowed: \["1024x1024", "1024x1536", "1536x1024"\]/);
  assert.match(source, /OPENAI_GPT_IMAGE_1_\$\{label\}_INVALID/);
});

test("sanitized provider dimensions are the same dimensions used for image execution", () => {
  assert.match(source, /size: dimensions\.size/);
  assert.match(source, /quality: dimensions\.quality/);
  assert.match(source, /pricing_quality: dimensions\.quality \|\| null/);
  assert.match(source, /pricing_size: dimensions\.size \|\| null/);
});
