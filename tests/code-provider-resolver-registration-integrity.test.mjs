import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const imageRegistration = await readFile(
  new URL("../lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageProviderRegistration.js", import.meta.url),
  "utf8",
);
const resolver = await readFile(
  new URL("../lib/platform/service-runtime/providers/ProviderResolver.js", import.meta.url),
  "utf8",
);

test("owned image registration declares every Modal configuration field it exposes", () => {
  assert.match(imageRegistration, /const modalTokenId = text\(process\.env\.MODAL_TOKEN_ID \|\| process\.env\.AVANTIQO_MODAL_TOKEN_ID\)/);
  assert.match(imageRegistration, /const modalTokenSecret = text\(process\.env\.MODAL_TOKEN_SECRET \|\| process\.env\.AVANTIQO_MODAL_TOKEN_SECRET\)/);
  assert.match(imageRegistration, /const modalEnvironment = text\(process\.env\.AVANTIQO_MODAL_ENVIRONMENT \|\| process\.env\.MODAL_ENVIRONMENT\)/);
  assert.match(imageRegistration, /modal_token_id_configured: Boolean\(modalTokenId\)/);
});

test("Code provider resolver still imports all owned registrations including avantiqo-code", () => {
  assert.match(resolver, /AvantiqoImageProviderRegistration\.js/);
  assert.match(resolver, /AvantiqoCodeProviderRegistration\.js/);
  assert.match(resolver, /ownedProviderForCapability/);
});
