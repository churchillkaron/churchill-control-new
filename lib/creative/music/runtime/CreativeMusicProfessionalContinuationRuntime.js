import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { updateMusicConversationState } from "./CreativeMusicConversationStateRuntime.js";
import { nextMusicProfessionalProductionAction } from "./CreativeMusicProfessionalProductionRuntime.js";
import { executeProfessionalStemSeparation } from "./CreativeMusicProfessionalStemRuntime.js";

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
  let next=nextMusicProfessionalProductionAction({ plan:input.plan || {}, input, evidence:evidenceFromAsset(sourceAsset) });
  if(next.status==="COMPLETE") return { contract:CONTRACT, status:"COMPLETE", source_asset_id:sourceAssetId, next_stage:next, release_ready:true };
  if(text(input.authorized_stage)!==text(next.stage_id)) return { contract:CONTRACT, status:"AUTHORIZATION_REQUIRED", source_asset_id:sourceAssetId, next_stage:next, release_ready:false, publication_authorized:false };
  let execution=null;
  if(next.stage_id==="STEM_SEPARATION"){
    execution=await executeProfessionalStemSeparation({ ...input, source_asset_id:sourceAssetId, source_audio:sourceAsset.file_url || sourceAsset.audio_url, duration_seconds:input.duration_seconds || sourceAsset.metadata?.duration_seconds });
    if(execution.pending || execution.failed) return { contract:CONTRACT, status:execution.pending?"STAGE_PENDING":"STAGE_FAILED", source_asset_id:sourceAssetId, stage_id:next.stage_id, execution, next_stage:next, release_ready:false };
  } else {
    return { contract:CONTRACT, status:"HANDOFF_REQUIRED", source_asset_id:sourceAssetId, next_stage:next, execution_surface:next.next_action?.execution_surface || null, release_ready:false };
  }
  sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
  next=nextMusicProfessionalProductionAction({ plan:input.plan || {}, input, evidence:evidenceFromAsset(sourceAsset) });
  const state={ manifest:next.manifest, next_stage:next.stage_id || null, next_action:next.next_action || null, source_asset_id:sourceAssetId, updated_at:new Date().toISOString() };
  await updateMusicConversationState({ organization_id:organizationId, creative_project_id:projectId, patch:{ professional_production_state:state }, decision_summary:`Professional production advanced after ${execution?.contract || "stage execution"}; next stage ${next.stage_id || "COMPLETE"}.` });
  return { contract:CONTRACT, status:next.status==="COMPLETE"?"COMPLETE":"ADVANCED", source_asset_id:sourceAssetId, execution, next_stage:next, professional_production_state:state, release_ready:next.release_ready===true, publication_authorized:false };
}

export const CreativeMusicProfessionalContinuationRuntime=Object.freeze({ contract:CONTRACT, continue:continueMusicProfessionalProduction });
