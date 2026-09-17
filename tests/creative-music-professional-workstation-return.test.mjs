import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const studio = fs.readFileSync('components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx','utf8');
const home = fs.readFileSync('components/creative/ProductionStudio/workspaces/MusicProfessionalReleasePanel.jsx','utf8');
const shell = fs.readFileSync('components/creative/ProductionStudio/workspaces/MusicUnifiedWorkstationShell.jsx','utf8');
const workstation = fs.readFileSync('components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx','utf8');

test('professional release refresh signal returns from workstation to home', () => {
  assert.match(studio, /professionalReleaseRevision/);
  assert.match(studio, /onProfessionalReleaseAdvanced/);
  assert.match(studio, /setMode\("home"\)/);
  assert.match(studio, /professionalReleaseRefreshKey=\{professionalReleaseRevision\}/);
});

test('professional release panel refreshes when workstation advances', () => {
  assert.match(home, /refreshKey = 0/);
  assert.match(home, /\[refresh, refreshKey\]/);
});

test('workstation propagates only professional release completion', () => {
  assert.match(shell, /onProfessionalReleaseAdvanced/);
  assert.match(workstation, /result\?\.professional_release/);
  assert.match(workstation, /onProfessionalReleaseAdvanced\?\.\(result\)/);
});

const compose = fs.readFileSync('components/creative/ProductionStudio/workspaces/MusicWorkspace.jsx','utf8');

test('professional generation returns to the stage-driven studio flow', () => {
  assert.match(compose, /onProfessionalReleaseStarted/);
  assert.match(compose, /form\.production_standard === "PROFESSIONAL_RELEASE"/);
  assert.match(studio, /onProfessionalReleaseStarted/);
});
