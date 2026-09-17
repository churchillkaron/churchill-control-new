import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const tuning = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicVocalTuningPlanPanel.jsx", import.meta.url), "utf8");
const timing = fs.readFileSync(new URL("../components/creative/ProductionStudio/workspaces/MusicVocalTimingPlanPanel.jsx", import.meta.url), "utf8");

test("vocal tuning review shows only pitch proposals that change audio", () => {
  assert.match(tuning, /reviewSegments = .*Math\.abs\(finite\(segment\.proposed_correction_cents/);
  assert.match(tuning, /reviewSegments\.map/);
  assert.doesNotMatch(tuning, /plan\.segments \|\| \[\]\)\.slice\(0, 60\)/);
});

test("vocal timing review shows only eligible proposed phrase moves", () => {
  assert.match(timing, /reviewPhrases = .*phrase\.eligible === true/);
  assert.match(timing, /reviewPhrases\.map/);
  assert.doesNotMatch(timing, /plan\.phrases \|\| \[\]\)\.slice\(0, 80\)/);
});
