import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const studio = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
test("Music Studio home leads with sellable customer outcomes", () => {
  assert.match(studio, /PRIMARY_MODE_IDS = Object\.freeze\(\["compose", "auto", "backing", "record"\]\)/);
  assert.match(studio, /label: "Make it Professional"/);
  assert.match(studio, /label: "Create a Song"/);
  assert.match(studio, /label: "Make a Backing Track"/);
  assert.match(studio, /label: "Record Audio"/);
  assert.match(studio, /section: "Produce & edit"/);
  assert.match(studio, /Open Workstation/);
});
