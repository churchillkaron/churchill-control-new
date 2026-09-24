import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const studio = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");

test("Music Studio opens Create a Song for governed local acceptance without calling it production certified", () => {
  assert.match(studio, /live_acceptance_ready === true/);
  assert.match(studio, /LOCAL_ACCEPTANCE_READY/);
  assert.match(studio, /Local acceptance ready/);
  assert.match(studio, /composeReady/);
});
