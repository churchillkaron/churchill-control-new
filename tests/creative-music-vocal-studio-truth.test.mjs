import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const panel = await readFile("components/creative/ProductionStudio/workspaces/MusicSpecialistStudioPanel.jsx", "utf8");
test("Vocal Studio distinguishes restored preview from reviewed correction", () => {
  assert.match(panel, /Restored vocal preview ready/);
  assert.match(panel, /Pitch\/timing correction is still a separate governed stage/);
  assert.match(panel, /requires listening review before it can replace this preview/);
  assert.doesNotMatch(panel, /certified owned Modal/);
});
