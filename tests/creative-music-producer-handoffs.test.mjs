import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const panel = await readFile("components/creative/ProductionStudio/workspaces/MusicProducerPanel.jsx", "utf8");
const workspace = await readFile("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
test("Producer is customer-facing and hands off to the real production tools", () => {
  assert.match(panel, /reversible snapshot/);
  assert.match(panel, /onOpen\?\.\("arrange"\)/);
  assert.match(panel, /onOpen\?\.\("midi"\)/);
  assert.match(panel, /onOpen\?\.\("workstation"\)/);
  assert.doesNotMatch(panel, /future owned Intelligence/);
  assert.match(workspace, /MusicProducerPanel[^>]+onOpen=\{setMode\}/);
});
