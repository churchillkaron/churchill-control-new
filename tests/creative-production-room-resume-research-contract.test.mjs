import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeWorkflowResolutionRuntime.js", import.meta.url), "utf8");

test("approved council resume reloads completed research before production-room bootstrap", () => {
  const resumeStart = source.indexOf("async resumeApprovedCouncil");
  assert.ok(resumeStart >= 0);
  const resume = source.slice(resumeStart);
  assert.match(resume, /const resumedResearch = await resolveCreativeDirectionResearch\(/);
  assert.match(resume, /force_research: false/);
  assert.match(resume, /reuse_completed_research_on_direction_restart: true/);
  assert.match(resume, /researched: resumedResearch/);
  assert.match(resume, /research: resumedResearch\.research \|\| null/);
});


test("sealed Research Room can recover validator-complete research without rerunning synthesis", () => {
  const research = fs.readFileSync(new URL("../lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js", import.meta.url), "utf8");
  assert.match(research, /function sealedResearchRoomStructuredResult/);
  assert.match(research, /RESEARCH_ROOM/);
  assert.match(research, /room\?\.status\)\.toUpperCase\(\) !== "SEALED"/);
  assert.match(research, /summary:/);
  assert.match(research, /strategic_synthesis:/);
  assert.match(research, /creative_grounding:/);
  assert.match(research, /claims:/);
  assert.match(research, /recovered_from_sealed_research_room: true/);
  assert.match(research, /evidence_dossier:/);
  assert.match(research, /dossier = sealedRecovery\.evidence_dossier \|\| dossier/);
});
