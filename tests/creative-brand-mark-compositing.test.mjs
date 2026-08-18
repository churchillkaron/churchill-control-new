import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const SHOT = "lib/creative/shots/documents/Shot.js";
const BIBLE = "lib/creative/video/runtime/CreativeShotBibleRuntime.js";
const RESOLVER = "lib/creative/video/runtime/CreativeBrandMarkCompositingRuntime.js";
const INTELLIGENCE = "lib/creative/assets/intelligence/repositories/CreativeAssetIntelligenceRepository.js";
const GATE = "lib/creative/assets/intelligence/runtime/CreativeBrandFidelityExecutionGate.js";
const PREPARE = "lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js";
const DISPATCH = "lib/creative/video/runtime/CreativeVideoGenerationDispatchRuntime.js";

test("exact brand marks are source-backed deterministic finishing evidence", async () => {
  const [shot, bible, resolver, intelligence, gate] = await Promise.all([
    fs.readFile(SHOT, "utf8"),
    fs.readFile(BIBLE, "utf8"),
    fs.readFile(RESOLVER, "utf8"),
    fs.readFile(INTELLIGENCE, "utf8"),
    fs.readFile(GATE, "utf8"),
  ]);

  assert.match(shot, /brand_mark_compositing/);
  assert.match(bible, /CREATIVE_BRAND_MARK_COMPOSITING_V1/);
  assert.match(bible, /CREATIVE_BRAND_MARK_SOURCE_CHECKSUM_REQUIRED/);
  assert.match(bible, /CREATIVE_BRAND_MARK_EXACT_MARKS_REQUIRED/);
  assert.match(bible, /CREATIVE_BRAND_MARK_PRESERVATION_REQUIREMENTS_REQUIRED/);
  assert.match(bible, /generative_brand_mark_rendering_allowed:\s*false/);
  assert.match(bible, /deterministic_finishing_required:\s*true/);
  assert.match(bible, /exact_brand_marks_transport_rendering_allowed:\s*false/);

  assert.match(intelligence, /creative_asset_intelligence/);
  assert.match(intelligence, /getLatestCompleted/);
  assert.match(intelligence, /\.eq\("organization_id", organizationId\)/);
  assert.match(intelligence, /\.eq\("asset_id", assetId\)/);
  assert.match(intelligence, /\.eq\("status", "COMPLETED"\)/);
  assert.match(intelligence, /\.order\("updated_at", \{ ascending: false \}\)/);
  assert.match(intelligence, /\.limit\(1\)/);

  assert.match(resolver, /UNIVERSAL_REFERENCE_FIDELITY_V1/);
  assert.match(resolver, /BRAND_MARK/);
  assert.match(resolver, /EXACT_COMPOSITE/);
  assert.match(resolver, /regeneration_prohibited\s*!==\s*true/);
  assert.match(resolver, /CreativeAssetsRuntime\.get/);
  assert.match(resolver, /CreativeAssetIntelligenceRepository\.getLatestCompleted/);
  assert.match(resolver, /CreativeBrandFidelityRuntime\.classify/);
  assert.match(resolver, /checksum_sha256/);
  assert.match(resolver, /source_regions:\s*regions/);
  assert.match(resolver, /required_marks:\s*requiredMarks/);
  assert.match(resolver, /mask_requirements:\s*uniqueText\(plan\.mask_requirements\)/);
  assert.match(resolver, /compositing_plan:\s*plan/);
  assert.match(resolver, /post_composition_checks:\s*postChecks/);
  assert.match(resolver, /source_intelligence_id:\s*selected\.intelligence\.id/);
  assert.match(resolver, /original_pixels_required:\s*true/);
  assert.match(resolver, /generative_brand_mark_rendering_allowed:\s*false/);
  assert.match(resolver, /post_composition_review_required:\s*true/);

  assert.match(gate, /CREATIVE_BRAND_MARK_ASSET_SCOPE_REQUIRED/);
  assert.match(gate, /CREATIVE_BRAND_MARK_SOURCE_OUTSIDE_ASSET_SCOPE/);
  assert.match(gate, /CREATIVE_BRAND_MARK_SOURCE_ASSET_UNTRUSTED/);
  assert.match(gate, /CREATIVE_BRAND_MARK_SOURCE_CHECKSUM_MISMATCH/);
  assert.match(gate, /brand_mark_compositing_execution_gate/);
  assert.match(gate, /provider_calls_executed:\s*false/);
  assert.match(gate, /publication_authorized:\s*false/);
});

test("video preparation resolves exact brand marks before route selection", async () => {
  const prepare = await fs.readFile(PREPARE, "utf8");

  const bibleBuild = prepare.indexOf("CreativeShotBibleRuntime.build({ shot, task })");
  const composite = prepare.indexOf("CreativeBrandMarkCompositingRuntime.resolve({");
  const bibleAssert = prepare.indexOf("CreativeShotBibleRuntime.assert(shotBible)");
  const route = prepare.indexOf("CreativeVideoEngineRouter.resolve({ shot_bible: shotBible })");
  const persist = prepare.indexOf("ProductionTaskRuntime.update(task.id");

  assert.ok(bibleBuild >= 0, "video preparation must build the canonical Shot Bible");
  assert.ok(composite > bibleBuild, "exact brand marks must be resolved after Shot Bible build");
  assert.ok(bibleAssert > composite, "resolved source evidence must be fail-closed before routing");
  assert.ok(route > bibleAssert, "video routing must receive the verified Shot Bible");
  assert.ok(persist > route, "verified preparation must be persisted only after route resolution");
});

test("video preparation requires current versioned readiness evidence before skip", async () => {
  const prepare = await fs.readFile(PREPARE, "utf8");

  assert.match(prepare, /CREATIVE_VIDEO_PRODUCTION_READINESS_V2/);
  assert.match(prepare, /function currentPreparationEvidence\(task = \{\}\)/);
  assert.match(prepare, /creative_video_production_readiness/);
  assert.match(prepare, /readiness\.contract === PREPARATION_CONTRACT/);
  assert.match(prepare, /readiness\.shot_bible_contract === CreativeShotBibleRuntime\.contract/);
  assert.match(prepare, /readiness\.video_engine_route_contract === CreativeVideoEngineRouter\.contract/);
  assert.match(prepare, /text\(readiness\.brand_mark_compositing_contract\) === text\(compositing\.contract\)/);
  assert.match(prepare, /currentPreparationEvidence\(task\)/);
  assert.match(prepare, /preparation_contract: PREPARATION_CONTRACT/);
});

test("governed manual video dispatch prepares and verifies readiness before claim", async () => {
  const [prepare, dispatch] = await Promise.all([
    fs.readFile(PREPARE, "utf8"),
    fs.readFile(DISPATCH, "utf8"),
  ]);

  assert.match(prepare, /export async function prepareCreativeVideoProductionTask/);
  assert.match(prepare, /CreativeBrandMarkCompositingRuntime\.resolve/);
  assert.match(prepare, /CreativeVideoEngineRouter\.resolve/);

  const prepareCall = dispatch.indexOf("prepareCreativeVideoProductionTask(task)");
  const brandGateCall = dispatch.indexOf("CreativeBrandFidelityExecutionGate.enforce(task)");
  const approvalRead = dispatch.indexOf("const approved = authorization(task)");
  const claimCall = dispatch.indexOf("ProductionTaskRuntime.claimForDispatch");
  const dispatchClaimedCall = dispatch.indexOf("ProductionTaskRuntime.dispatchClaimed");

  assert.ok(prepareCall >= 0, "governed dispatch must prepare the video task");
  assert.ok(brandGateCall > prepareCall, "brand verification must follow canonical video preparation");
  assert.ok(approvalRead > brandGateCall, "approval must be checked after readiness mutation");
  assert.ok(claimCall > approvalRead, "task claim must occur after readiness and approval checks");
  assert.ok(dispatchClaimedCall > claimCall, "provider dispatch must occur only after the governed claim");
});
