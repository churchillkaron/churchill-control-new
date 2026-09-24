import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workspace = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");
const specialist = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicSpecialistStudioPanel.jsx", "utf8");
const shell = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicUnifiedWorkstationShell.jsx", "utf8");

const expected = [
  ["compose", "Create a Song"],
  ["auto", "Make it Professional"],
  ["workstation", "Open Workstation"],
  ["backing", "Make a Backing Track"],
  ["record", "Record Audio"],
  ["remix", "Remix"],
  ["edit", "AI Edit"],
  ["extend", "Extend"],
  ["stems", "Separate Stems"],
  ["vocal", "Vocals"],
  ["mix", "Mix"],
  ["master", "Masters & QC"],
  ["deliverables", "Deliverables"],
];

for (const [id, label] of expected) {
  test(`Music Studio exposes ${label}`, () => {
    assert.ok(workspace.includes(`id: "${id}"`));
    assert.ok(workspace.includes(`label: "${label}"`));
  });
}

test("Workstation uses the canonical unified V2 audio session", () => {
  assert.match(workspace, /MusicUnifiedWorkstationShell/);
  assert.match(shell, /MusicMultitrackStudioPanelV2/);
  assert.match(shell, /MusicUnifiedTimelinePanel/);
  assert.match(shell, /MusicMixEngineerPanel/);
});

test("Vocal specialist keeps governed local source processing", () => {
  assert.match(specialist, /\/api\/creative\/music\/auto-studio/);
  assert.match(specialist, /vocal_polish/);
  assert.match(specialist, /source_rights_confirmed: true/);
});
