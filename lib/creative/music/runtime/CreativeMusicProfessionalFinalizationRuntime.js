import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeMusicFinishingRuntime } from "./CreativeMusicFinishingRuntime.js";
import { analyzeMusicPerceptualTranslation } from "./CreativeMusicPerceptualTranslationRuntime.js";
import { runMusicDailiesListening } from "./CreativeMusicDailiesListeningRuntime.js";
import { runMusicFinalTribunal } from "./CreativeMusicRepairAndTribunalRuntime.js";
import { buildProfessionalPremasterListeningRepairPlan } from "./CreativeMusicPremasterListeningRepairRuntime.js";
import { settleCurrentMusicMaster } from "./CreativeMusicCurrentMasterRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_PROFESSIONAL_FINALIZATION_V1";
function text(v){ return String(v ?? "").trim(); }
function assetProjectId(asset={}){ return text(asset.creative_project_id || asset.metadata?.creative_project_id); }
function object(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function list(v){ return Array.isArray(v)?v:[]; }

async function scopedAsset(id, organizationId, projectId, code){
  const asset=await CreativeAssetsRuntime.get(id);
  if(!asset || text(asset.organization_id)!==organizationId || assetProjectId(asset)!==projectId) throw new Error(code);
  return asset;
}

export async function reviewProfessionalPremasterListening(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  if(!organizationId || !projectId || !sourceAssetId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_LISTENING_CONTEXT_REQUIRED");
  const sourceAsset=await scopedAsset(sourceAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_PREMASTER_LISTENING_SOURCE_SCOPE_MISMATCH");
  if(sourceAsset.metadata?.professional_premaster_qc_passed!==true) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_LISTENING_QC_REQUIRED");
  const mixAssetId=text(sourceAsset.metadata?.professional_mix_asset_id); if(!mixAssetId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_LISTENING_MIX_REQUIRED");
  const mixAsset=await scopedAsset(mixAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_PREMASTER_LISTENING_MIX_SCOPE_MISMATCH");
  const binding=object(sourceAsset.metadata?.music_production_binding); if(!text(binding.direction_hash) || !text(binding.preproduction_hash)) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_LISTENING_BINDING_REQUIRED");
  const qc=object(sourceAsset.metadata?.professional_premaster_qc);
  if(text(qc.mix_asset_id)!==mixAssetId || qc.passed!==true) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_LISTENING_QC_STALE");
  const listening=await runMusicDailiesListening({ organization_id:organizationId, creative_project_id:projectId, asset:mixAsset, binding,
    master_report:{ stage:"PREMASTER", release_limiter_applied:false, technical_qc:qc }, translation_qc:qc.signal_review || null });
  const passed=listening?.report?.passed===true;
  const repairPlan=passed?null:buildProfessionalPremasterListeningRepairPlan({mix_asset_id:mixAssetId,dailies:listening});
  const evidence={ contract:"AVANTIQO_MUSIC_PROFESSIONAL_PREMASTER_LISTENING_V1", status:passed?"PASS":"PREMASTER_LISTENING_REPAIR_REQUIRED", passed,
    mix_asset_id:mixAssetId, reviewed_at:new Date().toISOString(), dailies:listening, repair_plan:repairPlan, artistic_review_independent_from_technical_qc:true, mastering_authorized:passed };
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata||{}), professional_premaster_listening_passed:passed, professional_premaster_listening:evidence } });
  await CreativeAssetsRuntime.update(mixAssetId,{ metadata:{ ...(mixAsset.metadata||{}), professional_premaster_listening_passed:passed, professional_premaster_listening:evidence } });
  return evidence;
}

export async function masterProfessionalPremaster(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  if(!organizationId || !projectId || !sourceAssetId) throw new Error("CREATIVE_MUSIC_PRO_MASTER_CONTEXT_REQUIRED");
  const sourceAsset=await scopedAsset(sourceAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_MASTER_SOURCE_SCOPE_MISMATCH");
  if(sourceAsset.metadata?.professional_premaster_qc_passed!==true) throw new Error("CREATIVE_MUSIC_PRO_MASTER_PREMASTER_QC_REQUIRED");
  if(sourceAsset.metadata?.professional_premaster_listening_passed!==true) throw new Error("CREATIVE_MUSIC_PRO_MASTER_PREMASTER_LISTENING_REQUIRED");
  const mixAssetId=text(sourceAsset.metadata?.professional_mix_asset_id); if(!mixAssetId) throw new Error("CREATIVE_MUSIC_PRO_MASTER_MIX_ASSET_REQUIRED");
  const mixAsset=await scopedAsset(mixAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_MASTER_MIX_SCOPE_MISMATCH");
  const session={ title:sourceAsset.title || mixAsset.title || "Music", objective:input.objective || sourceAsset.title || null,
    mastering_profile:text(input.mastering_profile || sourceAsset.metadata?.mastering_profile || "streaming"),
    mastering_destinations:list(input.mastering_destinations), music_production_binding:object(sourceAsset.metadata?.music_production_binding),
    music_direction_contract:object(sourceAsset.metadata?.music_direction_contract), music_world_class_plan:object(sourceAsset.metadata?.music_world_class_plan) };
  const finishing=await CreativeMusicFinishingRuntime.ensureMasters({ organizationId, projectId, missionId:text(input.creative_mission_id)||null, sourceAsset:mixAsset, session, objective:session.objective, retryFailed:input.retry_finishing===true });
  const passed=finishing?.ready===true && finishing?.destination_qc_passed===true && Boolean(finishing?.master_asset?.id);
  const evidence={ contract:CONTRACT, status:passed?"PASS":"MASTERING_REPAIR_REQUIRED", mastering_passed:passed, mix_asset_id:mixAssetId,
    master_asset_id:finishing?.master_asset?.id || null, master_asset_ids:list(finishing?.master_variants).map(r=>r?.finishing?.master_asset?.id).filter(Boolean),
    destination_qc_passed:finishing?.destination_qc_passed===true, perceptual_translation_measured:Boolean(finishing?.perceptual_translation),
    perceptual_translation:finishing?.perceptual_translation || null, master_set_lineage_current:finishing?.master_set_lineage_current===true };
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_mastering_passed:passed,
    professional_master_asset_id:evidence.master_asset_id, professional_master_asset_ids:evidence.master_asset_ids,
    professional_mastering_evidence:evidence, professional_translation_measurement:finishing?.perceptual_translation || null,
    professional_perceptual_translation_passed:false } });
  const current_master_settlement = passed ? await settleCurrentMusicMaster({
    organization_id: organizationId,
    creative_project_id: projectId,
    master_asset_id: evidence.master_asset_id,
    summary: "Professional mastering produced the current Music Studio master.",
  }) : null;
  return { ...evidence, finishing, current_master_settlement };
}

export async function verifyProfessionalTranslation(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  const sourceAsset=await scopedAsset(sourceAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_TRANSLATION_SOURCE_SCOPE_MISMATCH");
  if(sourceAsset.metadata?.professional_mastering_passed!==true) throw new Error("CREATIVE_MUSIC_PRO_TRANSLATION_MASTERING_REQUIRED");
  const masterAssetId=text(sourceAsset.metadata?.professional_master_asset_id); if(!masterAssetId) throw new Error("CREATIVE_MUSIC_PRO_TRANSLATION_MASTER_REQUIRED");
  const masterAsset=await scopedAsset(masterAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_TRANSLATION_MASTER_SCOPE_MISMATCH");
  let translation=masterAsset.metadata?.music_perceptual_translation || sourceAsset.metadata?.professional_translation_measurement || null;
  if(!translation) translation=await analyzeMusicPerceptualTranslation({ organization_id:organizationId, asset:masterAsset, destinations:list(input.mastering_destinations) });
  const passed=translation?.passed===true || translation?.all_variants_passed===true;
  await CreativeAssetsRuntime.update(masterAssetId,{ metadata:{ ...(masterAsset.metadata || {}), music_perceptual_translation:translation, music_perceptual_translation_passed:passed } });
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_perceptual_translation_passed:passed, professional_translation_evidence:translation } });
  return { contract:CONTRACT, status:passed?"PASS":"TRANSLATION_REPAIR_REQUIRED", passed, master_asset_id:masterAssetId, translation };
}

export async function runProfessionalDailies(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  const sourceAsset=await scopedAsset(sourceAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_DAILIES_SOURCE_SCOPE_MISMATCH");
  if(sourceAsset.metadata?.professional_perceptual_translation_passed!==true) throw new Error("CREATIVE_MUSIC_PRO_DAILIES_TRANSLATION_REQUIRED");
  const masterAssetId=text(sourceAsset.metadata?.professional_master_asset_id); const masterAsset=await scopedAsset(masterAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_DAILIES_MASTER_SCOPE_MISMATCH");
  const binding=object(sourceAsset.metadata?.music_production_binding); if(!text(binding.direction_hash) || !text(binding.preproduction_hash)) throw new Error("CREATIVE_MUSIC_PRO_DAILIES_BINDING_REQUIRED");
  const dailies=await runMusicDailiesListening({ organization_id:organizationId, creative_project_id:projectId, asset:masterAsset, binding,
    master_report:masterAsset.metadata?.master_report || {}, translation_qc:masterAsset.metadata?.music_perceptual_translation || sourceAsset.metadata?.professional_translation_evidence || null });
  const passed=dailies?.report?.passed===true;
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_dailies_passed:passed, professional_dailies:dailies } });
  return { contract:CONTRACT, status:passed?"PASS":"DAILIES_REPAIR_REQUIRED", passed, dailies };
}

export async function runProfessionalFinalTribunal(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  const sourceAsset=await scopedAsset(sourceAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_TRIBUNAL_SOURCE_SCOPE_MISMATCH");
  if(sourceAsset.metadata?.professional_dailies_passed!==true) throw new Error("CREATIVE_MUSIC_PRO_TRIBUNAL_DAILIES_REQUIRED");
  const masterAssetId=text(sourceAsset.metadata?.professional_master_asset_id); const masterAsset=await scopedAsset(masterAssetId,organizationId,projectId,"CREATIVE_MUSIC_PRO_TRIBUNAL_MASTER_SCOPE_MISMATCH");
  const plan=Object.keys(object(input.plan)).length ? object(input.plan) : object(sourceAsset.metadata?.music_world_class_plan);
  const binding=object(sourceAsset.metadata?.music_production_binding); const dailies=object(sourceAsset.metadata?.professional_dailies);
  const tribunal=await runMusicFinalTribunal({ organization_id:organizationId, plan, binding, dailies, master_report:masterAsset.metadata?.master_report || {} });
  const passed=tribunal?.release_ready===true;
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_tribunal_passed:passed, professional_final_tribunal:tribunal, professional_release_ready:passed } });
  return { contract:CONTRACT, status:passed?"PROFESSIONAL_RELEASE_CANDIDATE":"TRIBUNAL_REPAIR_REQUIRED", passed, release_ready:passed, tribunal, publication_authorized:false };
}

export const CreativeMusicProfessionalFinalizationRuntime=Object.freeze({ contract:CONTRACT, premasterListening:reviewProfessionalPremasterListening, master:masterProfessionalPremaster, translation:verifyProfessionalTranslation, dailies:runProfessionalDailies, tribunal:runProfessionalFinalTribunal });
