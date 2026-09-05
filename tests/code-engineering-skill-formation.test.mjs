import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillRuntime = await readFile(
  "lib/code/runtime/CodeAIEngineeringSkillRuntime.js",
  "utf8",
);
const workPackageRuntime = await readFile(
  "lib/code/runtime/CodeAIWorkPackageRuntime.js",
  "utf8",
);
const studioRoute = await readFile(
  "app/api/operator/code/mission/route.js",
  "utf8",
);

test("engineering skills require repeated verified missions with positive current-HEAD utility", () => {
  assert.match(skillRuntime, /AVANTIQO_CODE_AI_ENGINEERING_SKILL_V1/);
  assert.match(skillRuntime, /const MIN_SUPPORT = 2/);
  assert.match(skillRuntime, /verifiedOnly:\s*true/);
  assert.match(skillRuntime, /verified_complete === true/);
  assert.match(skillRuntime, /integrity_verified === true/);
  assert.match(skillRuntime, /utilityEligible/);
  assert.match(skillRuntime, /validation_success_count/);
  assert.match(skillRuntime, /stale_signal_count/);
  assert.match(skillRuntime, /contradiction_signal_count/);
  assert.match(skillRuntime, /positive_current_head_utility_required:\s*true/);
});

test("formed skills are dynamic evidence patterns rather than trusted permanent rules", () => {
  assert.match(skillRuntime, /dynamic_derivation:\s*true/);
  assert.match(skillRuntime, /persisted_as_trusted_rule:\s*false/);
  assert.match(skillRuntime, /trusted_rule_created:\s*false/);
  assert.match(skillRuntime, /automatic_knowledge_promotion:\s*false/);
  assert.match(skillRuntime, /current_head_revalidation_required:\s*true/);
  assert.match(skillRuntime, /patch_replay_allowed:\s*false/);
  assert.match(skillRuntime, /raw_patch_returned:\s*false/);
  assert.match(skillRuntime, /raw_source_returned:\s*false/);
  assert.match(skillRuntime, /raw_reasoning_returned:\s*false/);
  assert.match(skillRuntime, /authorization_effect:\s*"NONE"/);
  assert.match(skillRuntime, /commit_authority:\s*false/);
  assert.match(skillRuntime, /production_deploy_authority:\s*false/);
});

test("skill formation captures repeated area, verifier and repair patterns", () => {
  assert.match(skillRuntime, /AREA_VERIFICATION_SKILL/);
  assert.match(skillRuntime, /CROSS_AREA_VERIFIER_SKILL/);
  assert.match(skillRuntime, /REPAIR_RECOVERY_SKILL/);
  assert.match(skillRuntime, /formAreaSkills/);
  assert.match(skillRuntime, /formVerifierSkills/);
  assert.match(skillRuntime, /formRepairSkills/);
  assert.match(skillRuntime, /support_count/);
  assert.match(skillRuntime, /source_missions/);
  assert.match(skillRuntime, /average_utility_score/);
  assert.match(skillRuntime, /confidence/);
});

test("Code work packages bind formed skills once and force fresh repository validation", () => {
  assert.match(workPackageRuntime, /deriveCodeAIEngineeringSkills/);
  assert.match(workPackageRuntime, /formatCodeAIEngineeringSkillsForObjective/);
  assert.match(workPackageRuntime, /formed_engineering_skills/);
  assert.match(workPackageRuntime, /skillsAlreadyBound/);
  assert.match(workPackageRuntime, /kind:\s*"formed_engineering_skills"/);
  assert.match(workPackageRuntime, /persisted_as_trusted_rule:\s*false/);
  assert.match(workPackageRuntime, /current_head_revalidation_required:\s*true/);
  assert.match(workPackageRuntime, /engineering_skill_patch_replay_allowed:\s*false/);
  assert.match(workPackageRuntime, /authorization_effect:\s*"NONE"/);
});

test("Code Studio exposes the formed-skill receipt without granting persistence authority", () => {
  assert.match(studioRoute, /formed_engineering_skills:\s*result\?\.formed_engineering_skills/);
  assert.match(studioRoute, /production_routing_activated:\s*false/);
  assert.match(studioRoute, /pricing_activated:\s*false/);
  assert.match(studioRoute, /commit_performed:\s*false/);
  assert.match(studioRoute, /production_deploy_performed:\s*false/);
  assert.match(studioRoute, /external_fallback_allowed:\s*false/);
  assert.match(studioRoute, /raw_reasoning_returned:\s*false/);
});

test("formed skills explicitly remain advisory to current repository evidence", () => {
  assert.match(
    skillRuntime,
    /Validate the relevant current paths before use and rerun every cited verifier/,
  );
  assert.match(skillRuntime, /Never replay historical patches/);
  assert.match(
    skillRuntime,
    /Current repository evidence, current requirements, and fresh deterministic verification remain authoritative/,
  );
});
