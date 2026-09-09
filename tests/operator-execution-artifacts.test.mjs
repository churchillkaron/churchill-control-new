import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const home = fs.readFileSync(
  new URL("../components/operator/HomeAvantiqoIntelligence.jsx", import.meta.url),
  "utf8",
);
const panel = fs.readFileSync(
  new URL("../components/operator/AvantiqoOperator.jsx", import.meta.url),
  "utf8",
);
const artifactUi = fs.readFileSync(
  new URL("../components/operator/OperatorExecutionArtifacts.jsx", import.meta.url),
  "utf8",
);

test("Business Partner renders execution artifacts on both chat surfaces", () => {
  for (const source of [home, panel]) {
    assert.match(source, /OperatorExecutionArtifacts/);
    assert.match(source, /execution=\{message\.execution \|\| \{\}\}/);
  }
});

test("artifact renderer supports verified receipt PDFs and rejects unsafe schemes", () => {
  assert.match(artifactUi, /result\?\.artifacts/);
  assert.match(artifactUi, /application\/pdf/);
  assert.match(artifactUi, /target="_blank"/);
  assert.match(artifactUi, /rel="noreferrer noopener"/);
  assert.match(artifactUi, /url\.startsWith\("\/"\)/);
  assert.match(artifactUi, /\^https\?:\\\/\\\//i);
  assert.doesNotMatch(artifactUi, /javascript:/i);
});
