import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const studio = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");

test("Changes workspace is unmounted when inactive instead of CSS-hidden", () => {
  assert.match(studio, /\{studioView === "changes" \? <div>/);
  assert.match(studio, /<CodeEngineeringIntelligenceLiveCard/);
  assert.match(studio, /<CodeMissionHistoryPanel/);
  assert.doesNotMatch(studio, /className=\{studioView === "changes" \? "block" : "hidden"\}/);
});
