import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Music Studio exposes Vocal Mix and Master specialist screens", async () => {
  const workspace = await source("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx");
  assert.match(workspace, /id: "vocal", label: "Vocal Studio"/);
  assert.match(workspace, /id: "mix", label: "Mix Studio"/);
  assert.match(workspace, /id: "master", label: "Master Studio"/);
  assert.match(workspace, /MusicSpecialistStudioPanel/);
  assert.match(workspace, /mode="vocal"/);
  assert.match(workspace, /mode="mix"/);
  assert.match(workspace, /mode="master"/);
});

test("specialist screens use governed Auto Studio goals", async () => {
  const panel = await source("components/creative/ProductionStudio/workspaces/MusicSpecialistStudioPanel.jsx");
  assert.match(panel, /\/api\/creative\/music\/auto-studio/);
  assert.match(panel, /source_role: "vocal"/);
  assert.match(panel, /goal: "vocal_polish"/);
  assert.match(panel, /source_role: "stems"/);
  assert.match(panel, /goal: "mix_and_master"/);
  assert.match(panel, /source_role: "song"/);
  assert.match(panel, /goal: "release_master"/);
  assert.match(panel, /source_rights_confirmed: true/);
  assert.match(panel, /action: "execute_local"/);
});

test("specialist screens stay promptless and do not expose provider selection", async () => {
  const panel = await source("components/creative/ProductionStudio/workspaces/MusicSpecialistStudioPanel.jsx");
  assert.doesNotMatch(panel, /prompt/i);
  assert.doesNotMatch(panel, /preferred_providers/);
  assert.doesNotMatch(panel, /provider_policy/);
  assert.doesNotMatch(panel, /RUNPOD_/);
});
