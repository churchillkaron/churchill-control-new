import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile(new URL("../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js", import.meta.url), "utf8");

test("Service Runtime preserves cached input token accounting", () => {
  assert.match(runtime, /cached_input_tokens/);
  assert.match(runtime, /prompt_tokens_details\?\.cached_tokens/);
  assert.match(runtime, /provider_usage:\s*providerUsage\(result\)/);
  assert.match(runtime, /engine_prepare_ms/);
  assert.match(runtime, /generation_ms/);
  assert.match(runtime, /structured_finalization_ms/);
  assert.match(runtime, /compute_ms/);
});
