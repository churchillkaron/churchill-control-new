import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildMusicChangeSet, resolveMusicChangeTarget } from "../lib/creative/music/runtime/CreativeMusicChangeSetRuntime.js";

const context = {
  protected_ranges: [
    { start_seconds: 0, end_seconds: 22, label: "approved intro" },
    { start_seconds: 63, end_seconds: 81, label: "approved chorus" },
  ],
};

test("Music change set permits exact edits outside protected material", () => {
  const plan = buildMusicChangeSet({
    creative_project_id: "project-1",
    master_asset_id: "master-v3",
    instruction: "Make the bridge darker",
    intended_delta: "Reduce harmonic brightness and density while preserving tempo and vocal identity",
    target_range: { start_seconds: 92, end_seconds: 108, label: "bridge" },
    conversation_context: context,
  });
  assert.equal(plan.execution_ready, true);
  assert.equal(plan.preserve_outside_target, true);
  assert.deepEqual(plan.blockers, []);
  assert.equal(plan.target_range.start_seconds, 92);
  assert.match(plan.change_set_fingerprint, /^[a-f0-9]{32}$/);
});

test("Music change set blocks accidental edits across protected ranges", () => {
  const plan = buildMusicChangeSet({
    creative_project_id: "project-1",
    master_asset_id: "master-v3",
    instruction: "Make the chorus darker",
    target_range: { start_seconds: 60, end_seconds: 75, label: "chorus" },
    conversation_context: context,
  });
  assert.equal(plan.execution_ready, false);
  assert.equal(plan.requires_explicit_override, true);
  assert.ok(plan.blockers.includes("PROTECTED_RANGE_CONFLICT"));
  assert.equal(plan.protected_conflicts[0].label, "approved chorus");
});
test("Music change set allows explicit protected-range override", () => {
  const plan = buildMusicChangeSet({
    creative_project_id: "project-1",
    master_asset_id: "master-v3",
    instruction: "I explicitly want to change the approved chorus",
    intended_delta: "Darker chorus with fewer high-frequency layers",
    target_range: { start_seconds: 63, end_seconds: 81, label: "chorus" },
    conversation_context: context,
    allow_protected_overlap: true,
  });
  assert.equal(plan.execution_ready, true);
  assert.equal(plan.requires_explicit_override, true);
  assert.deepEqual(plan.blockers, []);
});

test("Business Partner Music planning exposes bounded change-set preview", () => {
  const source = fs.readFileSync("lib/creative/music/capabilities/planWorldClassMusicStudio.js", "utf8");
  assert.match(source, /buildMusicChangeSet/);
  assert.match(source, /music_change_set_preview/);
  assert.match(source, /allow_protected_overlap/);
});
test("intentional Music edit execution is fingerprint-bound and non-destructive", () => {
  const executor = fs.readFileSync("lib/creative/music/runtime/CreativeMusicIntentionalEditExecutionRuntime.js", "utf8");
  assert.match(executor, /CREATIVE_MUSIC_CHANGE_SET_CHANGED/);
  assert.match(executor, /buildMusicChangeSet/);
  assert.match(executor, /buildMusicTransformationPlan\("edit"/);
  assert.match(executor, /caption: changeSet\.intended_delta/);
  assert.match(executor, /parent_music_asset_id: sourceAsset\.id/);
  assert.match(executor, /preserve_outside_region: true/);
  assert.match(executor, /runMusicDailiesListening/);
  assert.match(executor, /runMusicFinalTribunal/);
});

test("Business Partner confirmed Music write boundary supports reviewed change sets", () => {
  const source = fs.readFileSync("lib/creative/music/capabilities/executeWorldClassMusicStudio.js", "utf8");
  assert.match(source, /expected_change_set_fingerprint/);
  assert.match(source, /executeMusicIntentionalEdit/);
  assert.match(source, /const repair = text\(payload\.repair_plan_hash\)/);
  assert.doesNotMatch(source, /const repair = text\(payload\.repair_plan_hash\) \|\| text\(payload\.master_asset_id\)/);
});

test("Music change target resolves a unique remembered section", () => {
  const resolved = resolveMusicChangeTarget({
    instruction: "Make the bridge darker",
    conversation_context: {
      approved_sections: [{ start_seconds: 92, end_seconds: 108, label: "bridge" }],
    },
  });
  assert.equal(resolved.status, "RESOLVED");
  assert.equal(resolved.section, "bridge");
  assert.deepEqual(resolved.target_range, {
    start_seconds: 92,
    end_seconds: 108,
    label: "bridge",
  });
});

test("Music change target selects an ordinal section when repeated", () => {
  const resolved = resolveMusicChangeTarget({
    instruction: "Make the second chorus darker",
    conversation_context: {
      approved_sections: [
        { start_seconds: 40, end_seconds: 58, label: "chorus" },
        { start_seconds: 96, end_seconds: 116, label: "chorus" },
      ],
    },
  });
  assert.equal(resolved.status, "RESOLVED_ORDINAL");
  assert.equal(resolved.target_range.start_seconds, 96);
  assert.equal(resolved.target_range.end_seconds, 116);
});

test("Music change target fails closed when a repeated section is ambiguous", () => {
  const resolved = resolveMusicChangeTarget({
    instruction: "Make the chorus darker",
    conversation_context: {
      approved_sections: [
        { start_seconds: 40, end_seconds: 58, label: "chorus" },
        { start_seconds: 96, end_seconds: 116, label: "chorus" },
      ],
    },
  });
  assert.equal(resolved.status, "SECTION_RANGE_AMBIGUOUS");
  assert.equal(resolved.target_range, null);
  assert.equal(resolved.candidates.length, 2);
});

test("Music change target fails closed when section timing is unknown", () => {
  const resolved = resolveMusicChangeTarget({
    instruction: "Make the bridge darker",
    conversation_context: { approved_sections: [] },
  });
  assert.equal(resolved.status, "SECTION_RANGE_UNKNOWN");
  assert.equal(resolved.target_range, null);
});

test("Music change set becomes executable from a unique remembered section", () => {
  const plan = buildMusicChangeSet({
    creative_project_id: "project-1",
    master_asset_id: "master-v3",
    instruction: "Make the bridge darker",
    intended_delta: "Reduce harmonic brightness while preserving tempo",
    conversation_context: {
      approved_sections: [{ start_seconds: 92, end_seconds: 108, label: "bridge" }],
      protected_ranges: [],
    },
  });
  assert.equal(plan.execution_ready, true);
  assert.equal(plan.target_resolution.status, "RESOLVED");
  assert.equal(plan.target_range.start_seconds, 92);
  assert.deepEqual(plan.blockers, []);
});

test("confirmed Music edit can re-resolve reviewed section without manual timestamps", () => {
  const source = fs.readFileSync("lib/creative/music/capabilities/executeWorldClassMusicStudio.js", "utf8");
  assert.doesNotMatch(source, /\|\| !payload\.target_range \|\|/);
  assert.match(source, /payload\.intended_delta \|\| payload\.objective/);
});
