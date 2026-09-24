import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("rights and safety reviewers have a dedicated discipline", () => {
  assert.match(source, /rights\|safety\|licen\[cs\]e\|consent[\s\S]*return "RIGHTS_SAFETY"/);
});

test("rights safety evidence is limited to referenced or explicitly selected assets", () => {
  assert.match(source, /function referencedAssetIds/);
  assert.match(source, /selected_asset_manifest:[\s\S]*\.filter\(\(asset\) => referenced\.has/);
});

test("rights safety evidence explicitly excludes unselected catalog assets as usage evidence", () => {
  assert.match(source, /unselected_catalog_assets_are_not_evidence_of_use: true/);
});

test("rights safety review policy forbids failures based on unrelated narration music and historical assets", () => {
  assert.match(source, /An asset merely present in the project catalog or asset manifest is not evidence that the film uses it/);
  assert.match(source, /unrelated narration, music, logos, reference files or historical assets/);
});

test("rights safety review stays inside rights consent provenance and release safety mandate", () => {
  assert.match(source, /Do not judge narrative quality, soundtrack taste, visual originality, scale transitions or other disciplines unless they create a concrete rights, consent, provenance or release-safety risk/);
});
