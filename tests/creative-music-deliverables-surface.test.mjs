import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicDeliverablesPanel.jsx", "utf8");

test("Music Studio exposes customer-facing project deliverables", () => {
  assert.match(workspace, /label: "Deliverables"/);
  assert.match(workspace, /MusicDeliverablesPanel/);
  assert.match(panel, /action: "history"/);
  assert.match(panel, /master-library/);
  assert.match(panel, /action: "resolve_asset"/);
  assert.match(panel, /Backing Track/);
  assert.match(panel, /Cleaned Audio/);
  assert.match(panel, /Everything ready to take with you/);
});
