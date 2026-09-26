import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile("scripts/run-avantiqo-code-competitive-reference-live.mjs", "utf8");

test("controlled competitive reference runner supports OpenAI Anthropic and Gemini", () => {
  assert.match(source, /\["openai", "anthropic", "google"\]/);
  assert.match(source, /providerInput === "gemini" \? "google"/);
  assert.match(source, /GEMINI_API_KEY/);
  assert.match(source, /generativelanguage\.googleapis\.com\/v1beta\/models\//);
  assert.match(source, /x-goog-api-key/);
});

test("Gemini usage metadata feeds the same attested token and cost path", () => {
  assert.match(source, /usageMetadata/);
  assert.match(source, /promptTokenCount/);
  assert.match(source, /candidatesTokenCount/);
  assert.match(source, /thoughtsTokenCount/);
  assert.match(source, /token_usage_source: "PROVIDER_API_USAGE_V1"/);
  assert.match(source, /pricing_source: "OPERATOR_APPROVED_REFERENCE_PRICING_V1"/);
});

test("Gemini remains competitive-reference-only and cannot alter normal routing", () => {
  assert.match(source, /normal_avantiqo_code_execution_uses_reference_provider: false/);
  assert.match(source, /runtime_provider_effect: "NONE"/);
  assert.match(source, /production_deploy_performed: false/);
});
