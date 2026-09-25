import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePremiumAdvertisingBenchmark } from "../lib/creative/stills/runtime/CreativeStillPremiumAdvertisingBenchmarkRuntime.js";
import { evaluateCreativeStillWorldClassQuality } from "../lib/creative/stills/runtime/CreativeStillWorldClassQualityRuntime.js";

const excellent={
  concept_distinctiveness_score:98,strategic_clarity_score:97,brand_memorability_score:98,premium_visual_authorship_score:98,art_direction_score:98,photographic_craft_score:97,production_design_score:97,material_realism_score:98,retouch_compositing_score:98,finishing_score:98,channel_adaptation_score:97,
  generic_advertising_language_absent:true,stock_visual_language_absent:true,brand_could_be_swapped_without_changing_idea:false,idea_survives_without_execution_tricks:true,primary_message_clear:true,product_or_subject_truth_preserved:true,exact_copy_verified:true,exact_brand_assets_verified:true,release_finish_verified:true,
};

test("premium advertising floor rejects generic interchangeable work even if execution scores are high",()=>{
  const result=evaluatePremiumAdvertisingBenchmark({...excellent,brand_could_be_swapped_without_changing_idea:true});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("PREMIUM_AD_BRAND_INTERCHANGEABLE"));
});

test("premium advertising floor treats finishing, exact copy and brand assets as release requirements",()=>{
  const result=evaluatePremiumAdvertisingBenchmark({...excellent,release_finish_verified:false,exact_copy_verified:false});
  assert.equal(result.passed,false);
  assert.ok(result.failures.includes("PREMIUM_AD_RELEASE_FINISH_NOT_VERIFIED"));
  assert.ok(result.failures.includes("PREMIUM_AD_EXACT_COPY_NOT_VERIFIED"));
});

test("world-class still quality can require premium advertising benchmark independently of graphic craft",()=>{
  const visual={overall_score:98,composition_score:97,depth_score:97,lighting_quality_score:97,material_realism_score:98,production_design_score:97,visual_hierarchy_score:97,place_specificity_score:97,scale_readability_score:97,artifact_score:98,synthetic_artifacts_absent:true,unexpected_text_or_watermark_absent:true,...excellent};
  const result=evaluateCreativeStillWorldClassQuality({evidence:visual,requirements:{premium_advertising_benchmark_required:true}});
  assert.equal(result.passed,true);
  assert.equal(result.premium_advertising_benchmark.passed,true);
});

test("still finishing requests premium advertising evidence for advertising deliverables", async()=>{
  const fs=await import("node:fs");
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeStillFinishingRuntime.js","utf8");
  assert.match(source,/premiumAdvertisingBenchmarkRequired/);
  assert.match(source,/premium_advertising_benchmark_required: premiumAdvertisingBenchmarkRequired\(task, design\)/);
});
