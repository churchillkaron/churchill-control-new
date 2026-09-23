import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync("lib/code/runtime/CodeAIConversationRuntime.js", "utf8");
const renderer = fs.readFileSync("components/creative/code/DesignPreviewRenderer.jsx", "utf8");

test("Code Studio rejects generic or unsupported first-pass design copy before research-ready status", () => {
  assert.match(runtime, /genericCopyPattern/);
  assert.match(runtime, /unsupportedImpactPattern/);
  assert.match(runtime, /DESIGN_PREVIEW_QUALITY_REPAIR/);
  assert.match(runtime, /repairIndices\.length/);
  assert.match(runtime, /designQualityPassed/);
  assert.match(runtime, /researchEvidenceAvailable = Boolean\(designResearch && list\(designResearch\?\.sources\)\.length >= 2\)/);
  assert.match(runtime, /researchedStructureAccepted = Boolean\(researchEvidenceAvailable && diverseDirections\)/);
  assert.match(runtime, /dynamicResearchApplied = researchedStructureAccepted/);
  assert.match(runtime, /quality_gate: \{ passed: designQualityPassed, issues: designQualityIssues \}/);
});

test("renderer blocks unsupported sustainability authority claims as a final safety net", () => {
  assert.match(renderer, /certification/);
  assert.match(renderer, /audited/);
  assert.match(renderer, /local leaders\?/);
  assert.match(renderer, /confirm\|confirms\|confirmed/);
});

test("Code Studio composes product systems from dynamic layout graphs instead of finite templates", () => {
  assert.match(runtime, /layout_graph exactly 5 nodes/);
  assert.match(runtime, /normalizeLayoutGraph/);
  assert.match(runtime, /Array\.isArray\(value\.nodes\)/);
  assert.match(runtime, /structuralRepairs/);
  assert.match(runtime, /recoverRepeatedLayoutGraphKeys/);
  assert.match(runtime, /recoverNamedJsonObjects/);
  assert.match(runtime, /\.replace\(\/\},\\s\*"name"/);
  assert.match(runtime, /graphKinds\.size >= 3/);
  assert.match(runtime, /navigation_items/);
  assert.match(renderer, /layoutGraph\.length >= 5/);
  assert.match(renderer, /gridColumn:`span \$\{span\}/);
  assert.match(renderer, /forcedType/);
});

test("Code Studio design DNA can generate palettes and visual treatment per direction", () => {
  assert.match(runtime, /normalizeStyleDNA/);
  assert.match(runtime, /palette.*background.*surface.*ink.*accent.*secondary/s);
  assert.match(renderer, /style_dna/);
  assert.match(renderer, /paletteFor\(schema\)/);
  assert.match(renderer, /dna\.radius/);
  assert.match(renderer, /dna\.surface/);
  assert.match(renderer, /dna\.typography/);
});

test("systems portals and transaction flows share the composition grammar", () => {
  assert.match(renderer, /const operationalLike = systemLike \|\| portalLike \|\| transactionLike/);
  assert.match(renderer, /if \(operationalLike\)/);
  assert.doesNotMatch(renderer, /Secure portal/);
  assert.doesNotMatch(renderer, /Finance command center/);
});

test("composition grammar exposes a broad functional primitive vocabulary", () => {
  for (const primitive of ["kanban","gantt","map","floorplan","matrix","scheduler","editor","inbox","command"]) {
    assert.match(runtime, new RegExp(primitive));
    assert.match(renderer, new RegExp(`exactType === ["']${primitive}["']|exactType === ["']calendar["'] \\|\\| exactType === ["']scheduler["']|exactType === ["']map["'] \\|\\| exactType === ["']floorplan["']`));
  }
});

test("product systems rotate across five shells instead of recycling the same trio", () => {
  assert.match(runtime, /baseSystemShells = \["sidebar","rail","topbar","split-pane","canvas"\]/);
  assert.match(runtime, /shellOffset = Number\.parseInt\(variationToken\.slice\(2, 4\), 16\) % 5/);
  assert.match(runtime, /rotatedSystemShells/);
  assert.match(runtime, /heroByShell/);
});

test("layout graphs preserve shell-specific composition grammar", () => {
  for (const shell of ["rail","sidebar","split-pane","topbar","canvas"]) {
    assert.match(renderer, new RegExp(`shell === ["']${shell}["']`));
  }
  assert.match(renderer, /Spatial flow · live/);
  assert.match(renderer, /Review context/);
  assert.match(renderer, /Financial control/);
});

test("manufactured neutral style DNA does not suppress a direction palette", () => {
  assert.match(renderer, /customIsNeutralFallback/);
  assert.match(renderer, /DIRECTION_PALETTES\[schema\?\.color_direction\]/);
});
