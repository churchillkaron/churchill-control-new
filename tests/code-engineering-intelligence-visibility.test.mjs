import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const progressRoute = await readFile(
  "app/api/operator/code/progress/route.js",
  "utf8",
);
const liveProgressRuntime = await readFile(
  "lib/code/runtime/CodeAILiveProgressRuntime.js",
  "utf8",
);
const visibleReceiptRuntime = await readFile(
  "lib/code/runtime/CodeAIEngineeringSkillVisibleReceiptRuntime.js",
  "utf8",
);
const intelligenceCard = await readFile(
  "components/operator/CodeEngineeringIntelligenceCard.jsx",
  "utf8",
);
const liveCard = await readFile(
  "components/operator/CodeEngineeringIntelligenceLiveCard.jsx",
  "utf8",
);
const businessPartnerSurface = await readFile(
  "components/operator/BusinessPartnerCodeMissionPanel.jsx",
  "utf8",
);
const studioPage = await readFile(
  "app/(system)/workspace/[organizationId]/creative/code/page.jsx",
  "utf8",
);

test("live Code progress exposes safe verified memory and formed skill metadata", () => {
  assert.match(liveProgressRuntime, /verified_engineering_memory:\s*compactEngineeringMemory/);
  assert.match(liveProgressRuntime, /formed_engineering_skills:\s*compactFormedSkills/);
  assert.match(liveProgressRuntime, /current_head_revalidation_required:\s*true/);
  assert.match(liveProgressRuntime, /patch_replay_allowed:\s*false/);
  assert.match(liveProgressRuntime, /raw_reasoning_persisted:\s*false/);
  assert.match(liveProgressRuntime, /source_content_persisted:\s*false/);
});

test("progress API joins persisted lifecycle evidence without making it mission-authoritative", () => {
  assert.match(progressRoute, /loadCodeAIEngineeringSkillVisibleReceipt/);
  assert.match(progressRoute, /engineering_intelligence/);
  assert.match(progressRoute, /VISIBLE_RECEIPT_UNAVAILABLE/);
  assert.match(progressRoute, /contains_raw_reasoning:\s*false/);
  assert.match(progressRoute, /contains_raw_source:\s*false/);
  assert.match(progressRoute, /automatic_knowledge_promotion:\s*false/);
  assert.match(progressRoute, /authorization_effect:\s*"NONE"/);
});

test("visible lifecycle receipt stays actor, organization, mission and repository scoped", () => {
  assert.match(visibleReceiptRuntime, /CODE_AI_ENGINEERING_SKILL_VISIBLE_RECEIPT_V1/);
  assert.match(visibleReceiptRuntime, /organization_id/);
  assert.match(visibleReceiptRuntime, /actor_id:\s*actor/);
  assert.match(visibleReceiptRuntime, /current_mission_id:\s*mission/);
  assert.match(visibleReceiptRuntime, /expectedRepository/);
  assert.match(visibleReceiptRuntime, /expectedRef/);
  assert.match(visibleReceiptRuntime, /contains_raw_reasoning:\s*false/);
  assert.match(visibleReceiptRuntime, /contains_raw_source:\s*false/);
  assert.match(visibleReceiptRuntime, /contains_raw_patch:\s*false/);
  assert.match(visibleReceiptRuntime, /reusable_platform_knowledge_written:\s*false/);
});

test("shared intelligence card explains strategy from evidence instead of chain-of-thought", () => {
  assert.match(intelligenceCard, /data-avantiqo-code-engineering-intelligence="true"/);
  assert.match(intelligenceCard, /Why this strategy/);
  assert.match(intelligenceCard, /What Code already knows/);
  assert.match(intelligenceCard, /Skills being applied/);
  assert.match(intelligenceCard, /What this mission taught the system/);
  assert.match(intelligenceCard, /no chain-of-thought/i);
  assert.match(intelligenceCard, /Current repository evidence and fresh verification remain authoritative/);
  assert.match(intelligenceCard, /PROMOTION_CANDIDATE/);
  assert.match(intelligenceCard, /DECAYING/);
  assert.match(intelligenceCard, /SUPPRESSED/);
});

test("Business Partner and Code Studio render the same governed engineering intelligence card", () => {
  assert.match(businessPartnerSurface, /CodeEngineeringIntelligenceLiveCard/);
  assert.match(businessPartnerSurface, /theme="light"/);
  assert.match(businessPartnerSurface, /compact/);
  assert.match(studioPage, /CodeEngineeringIntelligenceLiveCard/);
  assert.match(studioPage, /theme="dark"/);
  assert.match(liveCard, /\/api\/operator\/code\/progress/);
  assert.match(liveCard, /CodeEngineeringIntelligenceCard/);
  assert.match(liveCard, /data-avantiqo-code-intelligence-live-feed="true"/);
});

test("visible intelligence cannot grant commit, deploy or automatic knowledge authority", () => {
  assert.match(visibleReceiptRuntime, /automatic_knowledge_promotion:\s*false/);
  assert.match(visibleReceiptRuntime, /authorization_effect:\s*"NONE"/);
  assert.match(liveProgressRuntime, /authorization_effect:\s*"NONE"/);
  assert.match(intelligenceCard, /not trusted reusable knowledge/i);
});
