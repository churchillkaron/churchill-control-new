export const CREATIVE_STILL_PREMIUM_ADVERTISING_BENCHMARK_CONTRACT = "CREATIVE_STILL_PREMIUM_ADVERTISING_BENCHMARK_V1";

const DIMENSIONS = Object.freeze([
  ["concept_distinctiveness", "concept_distinctiveness_score", 96],
  ["strategic_clarity", "strategic_clarity_score", 95],
  ["brand_memorability", "brand_memorability_score", 96],
  ["visual_authorship", "premium_visual_authorship_score", 96],
  ["art_direction", "art_direction_score", 96],
  ["photographic_craft", "photographic_craft_score", 95],
  ["production_design", "production_design_score", 95],
  ["material_realism", "material_realism_score", 95],
  ["retouch_compositing", "retouch_compositing_score", 96],
  ["finishing", "finishing_score", 96],
  ["channel_adaptation", "channel_adaptation_score", 95],
]);

function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value){ const n=Number(value); return Number.isFinite(n) ? n : null; }
function bool(value){ return value === true; }

export function evaluatePremiumAdvertisingBenchmark(evidence = {}) {
  const root = object(evidence.result || evidence.review || evidence.validation || evidence);
  const scores = object(root.scores);
  const failures=[];
  const resolved={};
  for(const [name,field,floor] of DIMENSIONS){
    const value=finite(scores[field] ?? root[field]);
    resolved[name]=value;
    if(value===null) failures.push(`PREMIUM_AD_SCORE_REQUIRED:${field}`);
    else if(value<floor) failures.push(`PREMIUM_AD_BELOW_FLOOR:${name}:${value}:${floor}`);
  }
  if(root.generic_advertising_language_absent === false) failures.push("PREMIUM_AD_GENERIC_LANGUAGE_PRESENT");
  if(root.stock_visual_language_absent === false) failures.push("PREMIUM_AD_STOCK_VISUAL_LANGUAGE_PRESENT");
  if(root.brand_could_be_swapped_without_changing_idea === true) failures.push("PREMIUM_AD_BRAND_INTERCHANGEABLE");
  if(root.idea_survives_without_execution_tricks === false) failures.push("PREMIUM_AD_IDEA_TOO_EXECUTION_DEPENDENT");
  if(root.primary_message_clear === false) failures.push("PREMIUM_AD_MESSAGE_HIERARCHY_FAILED");
  if(root.product_or_subject_truth_preserved === false) failures.push("PREMIUM_AD_SUBJECT_TRUTH_FAILED");
  if(root.exact_copy_verified !== true) failures.push("PREMIUM_AD_EXACT_COPY_NOT_VERIFIED");
  if(root.exact_brand_assets_verified !== true) failures.push("PREMIUM_AD_EXACT_BRAND_ASSETS_NOT_VERIFIED");
  if(root.release_finish_verified !== true) failures.push("PREMIUM_AD_RELEASE_FINISH_NOT_VERIFIED");
  return Object.freeze({
    contract:CREATIVE_STILL_PREMIUM_ADVERTISING_BENCHMARK_CONTRACT,
    benchmark_id:"HIGH_END_INTERNATIONAL_ADVERTISING_MINIMUM_V1",
    passed:failures.length===0,
    scores:resolved,
    weakest_score:Object.values(resolved).filter((v)=>v!==null).length ? Math.min(...Object.values(resolved).filter((v)=>v!==null)) : null,
    failures:[...new Set(failures)],
    policies:{
      strong_execution_cannot_rescue_generic_idea:true,
      average_score_cannot_hide_critical_failure:true,
      brand_and_copy_truth_fail_closed:true,
      finishing_is_a_production_stage_not_a_filter:true,
      channel_variants_require_recomposition_not_blind_resize:true,
    },
  });
}

export const CreativeStillPremiumAdvertisingBenchmarkRuntime=Object.freeze({
  contract:CREATIVE_STILL_PREMIUM_ADVERTISING_BENCHMARK_CONTRACT,
  dimensions:DIMENSIONS,
  evaluate:evaluatePremiumAdvertisingBenchmark,
});

export default CreativeStillPremiumAdvertisingBenchmarkRuntime;
