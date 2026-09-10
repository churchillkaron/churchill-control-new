import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const renderer = fs.readFileSync(new URL("../components/operator/OperatorExecutionArtifacts.jsx", import.meta.url), "utf8");
const home = fs.readFileSync(new URL("../components/operator/HomeAvantiqoIntelligence.jsx", import.meta.url), "utf8");
const panel = fs.readFileSync(new URL("../components/operator/AvantiqoOperator.jsx", import.meta.url), "utf8");

test("Business Partner has one universal output preview for documents and media", () => {
  for (const signal of ["file_url", "preview_url", "image_url", "video_url", "audio_url", "generated_media_url", "storage_reference"]) {
    assert.match(renderer, new RegExp(`\\"${signal}\\"`));
  }
  assert.match(renderer, /<Image /);
  assert.match(renderer, /<video /);
  assert.match(renderer, /<audio /);
  assert.match(renderer, /<iframe /);
  assert.match(renderer, /data-avantiqo-universal-preview="true"/);
  assert.match(renderer, /<Folder size=\{13\}/);
});

test("universal preview is wired to both Business Partner chat surfaces with evidence and organization context", () => {
  for (const source of [home, panel]) {
    assert.match(source, /OperatorExecutionArtifacts execution=\{message\.execution \|\| \{\}\} evidence=\{message\.evidence \|\| \{\}\} organizationId=\{organizationId\}/);
  }
});

test("universal preview keeps unsafe URL schemes out", () => {
  assert.match(renderer, /url\.startsWith\("\/"\)/);
  assert.match(renderer, /\^https\?:\\\/\\\//i);
  assert.match(renderer, /url\.startsWith\("storage:\/\/"\)/);
  assert.doesNotMatch(renderer, /javascript:/i);
});
