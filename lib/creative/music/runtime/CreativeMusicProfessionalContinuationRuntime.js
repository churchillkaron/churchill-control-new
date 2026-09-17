import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { updateMusicConversationState } from "./CreativeMusicConversationStateRuntime.js";
import { nextMusicProfessionalProductionAction } from "./CreativeMusicProfessionalProductionRuntime.js";
import { executeProfessionalStemSeparation } from "./CreativeMusicProfessionalStemRuntime.js";
import { prepareProfessionalVocalProduction } from "./CreativeMusicProfessionalVocalProductionRuntime.js";
import { prepareProfessionalMix, acceptProfessionalMixRender, certifyProfessionalPremaster } from "./CreativeMusicProfessionalMixRuntime.js";
import { masterProfessionalPremaster, verifyProfessionalTranslation, runProfessionalDailies, runProfessionalFinalTribunal } from "./CreativeMusicProfessionalFinalizationRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_PROFESSIONAL_CONTINUATION_V1";
function text(v){ return String(v ?? "").trim(); }
function object(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }

function evidenceFromAsset(asset={}){
  const m=object(asset.metadata);
  return {
    source_generated:Boolean(asset.id), source_asset_id:asset.id || null,
    stems_ready:m.professional_stems_ready===true, stems:Array.isArray(m.professional_stems)?m.professional_stems:[],
    vocal_production_passed:m.professional_vocal_production_passed===true,
    mix_passed:m.professional_mix_passed===true, mix_asset_id:m.professional_mix_asset_id || null,
    premaster_qc_passed:m.professional_premaster_qc_passed===true,
    mastering_passed:m.professional_mastering_passed===true, master_asset_id:m.professional_master_asset_id || null,
    perceptual_translation_passed:m.professional_perceptual_translation_passed===true,
    dailies_passed:m.professional_dailies_passed===true,
    tribunal_passed:m.professional_tribunal_passed===true,
  };
}

export async function continueMusicProfessionalProduction(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  if(!organizationId || !projectId || !sourceAssetId) throw new Error("CREATIVE_MUSIC_PRO_CONTINUATION_CONTEXT_REQUIRED");
  let sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
  if(!sourceAsset || text(sourceAsset.organization_id)!==organizationId || text(sourceAsset.creative_project_id)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_CONTINUATION_SOURCE_SCOPE_MISMATCH");
  input={
    ...input,
    instrumental: typeof input.instrumental === "boolean" ? input.instrumental : sourceAsset.metadata?.instrumental === true,
    production_standard: text(input.production_standard || sourceAsset.metadata?.professional_release_standard || "PROFESSIONAL_RELEASE"),
  };
  const persistedPlan=object(sourceAsset.metadata?.music_world_class_plan);
  const activePlan=Object.keys(object(input.plan)).length ? object(input.plan) : persistedPlan;
  let next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
  if(next.status==="COMPLETE") return { contract:CONTRACT, status:"COMPLETE", source_asset_id:sourceAssetId, next_stage:next, release_ready:true };
  if(text(input.authorized_stage)!==text(next.stage_id)) return { contract:CONTRACT, status:"AUTHORIZATION_REQUIRED", source_asset_id:sourceAssetId, next_stage:next, release_ready:false, publication_authorized:false };
  let execution=null;
  if(next.stage_id==="STEM_SEPARATION"){
    execution=await executeProfessionalStemSeparation({ ...input, source_asset_id:sourceAssetId, source_audio:sourceAsset.file_url || sourceAsset.audio_url, duration_seconds:input.duration_seconds || sourceAsset.metadata?.duration_seconds });
    if(execution.pending || execution.failed) return { contract:CONTRACT, status:execution.pending?"STAGE_PENDING":"STAGE_FAILED", source_asset_id:sourceAssetId, stage_id:next.stage_id, execution, next_stage:next, release_ready:false };
  } else if(next.stage_id==="VOCAL_PRODUCTION"){
    execution=await prepareProfessionalVocalProduction({ ...input, source_asset_id:sourceAssetId, duration_seconds:input.duration_seconds || sourceAsset.metadata?.duration_seconds });
    sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
    next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
    const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, vocal_preparation:execution, updated_at:new Date().toISOString() };
    await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:"Professional vocal preparation is ready for reviewed correction; vocal production remains gated until listening approval." });
    return { contract:CONTRACT, status:"REVIEW_REQUIRED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:false, publication_authorized:false };
  } else if(next.stage_id==="MIX_ENGINEERING"){
    if(text(input.mix_asset_id)){
      execution=await acceptProfessionalMixRender({ ...input, source_asset_id:sourceAssetId });
      sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
      next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
      const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, mix_evidence:execution, updated_at:new Date().toISOString() };
      await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional mix render accepted; next stage ${next.stage_id || "COMPLETE"}.` });
      return { contract:CONTRACT, status:"ADVANCED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:false, publication_authorized:false };
    }
    execution=await prepareProfessionalMix({ ...input, source_asset_id:sourceAssetId });
    return { contract:CONTRACT, status:"HANDOFF_REQUIRED", source_asset_id:sourceAssetId, execution, next_stage:next, execution_surface:"WORKSTATION", release_ready:false, publication_authorized:false };
  } else if(next.stage_id==="PREMASTER_QC"){
    if(!text(input.mix_asset_id)) return { contract:CONTRACT, status:"MIX_ASSET_REQUIRED", source_asset_id:sourceAssetId, next_stage:next, release_ready:false };
    execution=await certifyProfessionalPremaster({ ...input, source_asset_id:sourceAssetId });
    sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
    next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
    const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, premaster_qc:execution.premaster_qc || null, updated_at:new Date().toISOString() };
    await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional pre-master QC ${execution.mastering_allowed ? "passed" : "requires repair"}; next stage ${next.stage_id || "PREMASTER_QC"}.` });
    return { contract:CONTRACT, status:execution.mastering_allowed?"ADVANCED":"REPAIR_REQUIRED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:false, publication_authorized:false };
  } else if(next.stage_id==="MASTERING"){
    const priorMastering=object(sourceAsset.metadata?.professional_mastering_evidence);
    const retryFinishing=input.retry_finishing===true || (priorMastering.mastering_passed===false && text(priorMastering.status)==="MASTERING_REPAIR_REQUIRED");
    execution=await masterProfessionalPremaster({ ...input, source_asset_id:sourceAssetId, retry_finishing:retryFinishing });
    sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
    next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
    const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, mastering_evidence:execution, updated_at:new Date().toISOString() };
    await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional mastering ${execution.mastering_passed ? "passed" : "requires repair"}; next stage ${next.stage_id || "MASTERING"}.` });
    return { contract:CONTRACT, status:execution.mastering_passed?"ADVANCED":"REPAIR_REQUIRED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:false, publication_authorized:false };
  } else if(next.stage_id==="PERCEPTUAL_TRANSLATION"){
    execution=await verifyProfessionalTranslation({ ...input, source_asset_id:sourceAssetId });
    sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
    next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
    const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, translation_evidence:execution.translation || null, updated_at:new Date().toISOString() };
    await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional translation ${execution.passed ? "passed" : "requires repair"}; next stage ${next.stage_id || "PERCEPTUAL_TRANSLATION"}.` });
    return { contract:CONTRACT, status:execution.passed?"ADVANCED":"REPAIR_REQUIRED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:false, publication_authorized:false };
  } else if(next.stage_id==="DAILIES_LISTENING"){
    execution=await runProfessionalDailies({ ...input, source_asset_id:sourceAssetId });
    sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
    next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
    const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, dailies_status:execution.status, updated_at:new Date().toISOString() };
    await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional dailies ${execution.passed ? "passed" : "requires repair"}; next stage ${next.stage_id || "DAILIES_LISTENING"}.` });
    return { contract:CONTRACT, status:execution.passed?"ADVANCED":"REPAIR_REQUIRED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:false, publication_authorized:false };
  } else if(next.stage_id==="FINAL_TRIBUNAL"){
    execution=await runProfessionalFinalTribunal({ ...input, source_asset_id:sourceAssetId });
    sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
    next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
    const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, final_tribunal_status:execution.status, updated_at:new Date().toISOString() };
    await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional final tribunal ${execution.passed ? "passed" : "requires repair"}; release readiness ${next.release_ready === true ? "complete" : "blocked"}.` });
    return { contract:CONTRACT, status:execution.passed?"COMPLETE":"REPAIR_REQUIRED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:next.release_ready===true, publication_authorized:false };
  } else {
    return { contract:CONTRACT, status:"HANDOFF_REQUIRED", source_asset_id:sourceAssetId, next_stage:next, execution_surface:next.next_action?.execution_surface || null, release_ready:false };
  }
  sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
  next=nextMusicProfessionalProductionAction({ plan:activePlan, input, evidence:evidenceFromAsset(sourceAsset) });
  const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, updated_at:new Date().toISOString() };
  await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional production advanced after ${execution?.contract || "stage execution"}; next stage ${next.stage_id || "COMPLETE"}.` });
  return { contract:CONTRACT, status:next.status==="COMPLETE"?"COMPLETE":"ADVANCED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:next.release_ready===true, publication_authorized:false };
}

export const CreativeMusicProfessionalContinuationRuntime=Object.freeze({ contract:CONTRACT, continue:continueMusicProfessionalProduction });
