import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const specialist = read("components/creative/specialist/CreativeSpecialistStudio.jsx");
const production = read("components/creative/ProductionStudio/workspaces/ProductionWorkspace.jsx");
const dock = read("components/creative/ProductionStudio/layout/BottomDock.jsx");
const timeline = read("components/creative/ProductionStudio/timeline/TimelinePanel.jsx");
const assets = read("components/creative/ProductionStudio/assets/AssetBrowser.jsx");
const runProduction = read("components/creative/ProductionStudio/actions/RunProductionButton.jsx");

test("Video Studio uses the warm Avantiqo workspace language instead of a black glass shell", () => {
  assert.match(specialist, /#FBF8F3/);
  assert.match(specialist, /#2A2723/);
  assert.match(specialist, /#A37849/);
  assert.match(production, /#F5F1EA/);
  assert.match(production, /#FBF8F3/);
  assert.match(production, /#76583A/);
  assert.doesNotMatch(production, /bg-\[#050505\]/);
  assert.doesNotMatch(production, /bg-\[#070707\]/);
  assert.doesNotMatch(dock, /divide-white/);
  assert.doesNotMatch(timeline, /bg-black\/20/);
  assert.doesNotMatch(assets, /bg-white\/\[0\.03\]/);
});

test("Video Studio is work-first: shot navigator, media viewer, review inspector and timeline stay primary", () => {
  assert.match(production, /Shot navigator/);
  assert.match(production, /Selected shot/);
  assert.match(production, /Review & release/);
  assert.match(production, /Production chain/);
  assert.match(production, /Focus viewer/);
  assert.match(timeline, /Timeline/);
  assert.match(assets, /Media/);
  assert.doesNotMatch(production, /sm:grid-cols-3 xl:grid-cols-7/);
});

test("Director governance remains available without occupying the edit surface", () => {
  assert.match(production, /Direction & approvals/);
  assert.match(production, /producerOpen/);
  assert.match(production, /CreativeDirectorCockpit/);
  assert.doesNotMatch(production, /CreativeConceptDirector/);
  assert.doesNotMatch(production, /CreativeQualityDirector/);
});

test("Timeline and media dock are dense production tools rather than card galleries", () => {
  assert.match(timeline, /tracks\.length/);
  assert.match(timeline, /selected\?\.id/);
  assert.match(assets, /query/);
  assert.match(assets, /visibleGroups/);
  assert.doesNotMatch(assets, /grid grid-cols-2 gap-3/);
});

test("Run Production follows the new Avantiqo primary-action treatment", () => {
  assert.match(runProduction, /bg-\[#25231F\]/);
  assert.match(runProduction, /text-white/);
  assert.match(runProduction, /runtime\.refresh/);
  assert.doesNotMatch(runProduction, /alert\(/);
});
