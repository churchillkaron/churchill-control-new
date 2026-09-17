import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { buildMusicReleaseRenderPlan } from "./CreativeMusicReleaseRenderPlanRuntime.js";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "./CreativeMusicMixerRoutingRuntime.js";
import { validateMusicMultitrackProject } from "./CreativeMusicMultitrackRuntime.js";
import { analyzeMusicPerceptualTranslation } from "./CreativeMusicPerceptualTranslationRuntime.js";
import { buildProfessionalPremasterSignalReview } from "./CreativeMusicPremasterSignalReviewRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_PROFESSIONAL_MIX_V2";
const MULTITRACK_KEY = "music_multitrack_project";
function text(v){ return String(v ?? "").trim(); }
function assetProjectId(asset={}){ return text(asset.creative_project_id || asset.metadata?.creative_project_id); }
function finite(v,f=null){ const n=Number(v); return Number.isFinite(n)?n:f; }

export async function prepareProfessionalMix(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  if(!organizationId || !projectId || !sourceAssetId) throw new Error("CREATIVE_MUSIC_PRO_MIX_CONTEXT_REQUIRED");
  const project=await CreativeProjectRepository.getById(projectId); const sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || text(sourceAsset.organization_id)!==organizationId || assetProjectId(sourceAsset)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_MIX_SCOPE_MISMATCH");
  const instrumental=typeof input.instrumental === "boolean" ? input.instrumental : sourceAsset.metadata?.instrumental === true;
  if(sourceAsset.metadata?.professional_vocal_production_passed!==true && !instrumental) throw new Error("CREATIVE_MUSIC_PRO_MIX_VOCAL_PRODUCTION_REQUIRED");
  const saved=project.metadata?.[MULTITRACK_KEY]; if(!saved) throw new Error("CREATIVE_MUSIC_PRO_MIX_MULTITRACK_REQUIRED");
  const session=ensureMusicEngineeringBuses(structuredClone(saved));
  validateMusicMultitrackProject(session); validateMusicMixerRouting(session);
  const releasePlan=buildMusicReleaseRenderPlan(session,{ mastering_profile:text(input.mastering_profile || "streaming"), release_mp3:true, track_stems:true, group_stems:true });
  if(releasePlan.readiness.release_render_ready!==true) return { contract:CONTRACT, status:"MIX_SESSION_REPAIR_REQUIRED", release_ready:false, blockers:releasePlan.readiness.blockers, release_plan:releasePlan, workstation_render_required:true };
  const prep={ contract:CONTRACT, status:"WORKSTATION_RENDER_REQUIRED", project_revision:releasePlan.project_revision, renderer:releasePlan.renderer, release_plan:releasePlan,
    source_asset_id:sourceAssetId, source_asset_ids:releasePlan.source_asset_ids, workstation_render_required:true, browser_preview_is_not_release_master:true,
    required_next_api:"/api/creative/music/release-render", required_actions:["prepare_upload","register"], professional_mix_passed:false };
  await CreativeProjectRepository.update(projectId,{ metadata:{ ...(project.metadata || {}), [MULTITRACK_KEY]:session, professional_mix_preparation:prep, music_multitrack_updated_at:new Date().toISOString() } });
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_mix_preparation:prep, professional_mix_passed:false, professional_premaster_qc_passed:false } });
  return prep;
}

export async function acceptProfessionalMixRender(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id), mixAssetId=text(input.mix_asset_id);
  if(!organizationId || !projectId || !sourceAssetId || !mixAssetId) throw new Error("CREATIVE_MUSIC_PRO_MIX_ACCEPT_CONTEXT_REQUIRED");
  const [project,sourceAsset,mixAsset]=await Promise.all([CreativeProjectRepository.getById(projectId),CreativeAssetsRuntime.get(sourceAssetId),CreativeAssetsRuntime.get(mixAssetId)]);
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || !mixAsset || text(sourceAsset.organization_id)!==organizationId || text(mixAsset.organization_id)!==organizationId || assetProjectId(sourceAsset)!==projectId || assetProjectId(mixAsset)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_MIX_ACCEPT_SCOPE_MISMATCH");
  if(text(mixAsset.metadata?.music_asset_kind)!=="MIX_RENDER") throw new Error("CREATIVE_MUSIC_PRO_MIX_RENDER_REQUIRED");
  const currentRevision=Math.max(0,Math.round(finite(project.metadata?.[MULTITRACK_KEY]?.revision,0)));
  const mixRevision=Math.max(0,Math.round(finite(mixAsset.metadata?.project_revision,-1)));
  if(mixRevision!==currentRevision) throw new Error("CREATIVE_MUSIC_PRO_MIX_RENDER_STALE");
  if(mixAsset.metadata?.full_mix_processing_applied!==true || mixAsset.metadata?.release_limiter_applied!==false) throw new Error("CREATIVE_MUSIC_PRO_MIX_RENDER_EVIDENCE_INVALID");
  const evidence={ contract:CONTRACT, status:"MIX_RENDER_ACCEPTED", mix_asset_id:mixAssetId, project_revision:mixRevision, accepted_at:new Date().toISOString(), premaster_qc_passed:false };
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_mix_passed:true, professional_mix_asset_id:mixAssetId, professional_mix_evidence:evidence, professional_premaster_qc_passed:false } });
  return evidence;
}

export async function certifyProfessionalPremaster(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id), mixAssetId=text(input.mix_asset_id);
  if(!organizationId || !projectId || !sourceAssetId || !mixAssetId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_CONTEXT_REQUIRED");
  const [project,sourceAsset,mixAsset]=await Promise.all([CreativeProjectRepository.getById(projectId),CreativeAssetsRuntime.get(sourceAssetId),CreativeAssetsRuntime.get(mixAssetId)]);
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || !mixAsset || text(sourceAsset.organization_id)!==organizationId || text(mixAsset.organization_id)!==organizationId || assetProjectId(sourceAsset)!==projectId || assetProjectId(mixAsset)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_SCOPE_MISMATCH");
  if(text(mixAsset.metadata?.music_asset_kind)!=="MIX_RENDER") throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_MIX_RENDER_REQUIRED");
  if(sourceAsset.metadata?.professional_mix_passed!==true || text(sourceAsset.metadata?.professional_mix_asset_id)!==mixAssetId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_ACCEPTED_MIX_REQUIRED");
  const currentRevision=Math.max(0,Math.round(finite(project.metadata?.[MULTITRACK_KEY]?.revision,0))); const mixRevision=Math.max(0,Math.round(finite(mixAsset.metadata?.project_revision,-1)));
  const secureMixUrl=await resolveCreativeProviderAssetUrl({ organization_id:organizationId, value:mixAsset.file_url || mixAsset.url });
  const translation=await analyzeMusicPerceptualTranslation({ organization_id:organizationId, asset:{ ...mixAsset, file_url:secureMixUrl, metadata:{ ...(mixAsset.metadata||{}), deliveries:[] } }, destinations:[] });
  const signalReview=buildProfessionalPremasterSignalReview(translation,mixAsset.metadata||{});
  const checks={ project_revision_current:mixRevision===currentRevision, no_clipping:mixAsset.metadata?.clipping!==true, full_mix_processing_applied:mixAsset.metadata?.full_mix_processing_applied===true,
    release_limiter_not_applied:mixAsset.metadata?.release_limiter_applied===false, true_peak_not_falsely_certified:mixAsset.metadata?.true_peak_certified!==true,
    sample_rate_valid:finite(mixAsset.metadata?.sample_rate,0)>=44100, stereo:Math.round(finite(mixAsset.metadata?.channels,0))===2,
    peak_evidence_present:Number.isFinite(Number(mixAsset.metadata?.peak_dbfs)), rms_evidence_present:Number.isFinite(Number(mixAsset.metadata?.rms_dbfs)),
    combined_signal_review_passed:signalReview.failures.length===0 };
  const failures=Object.entries(checks).filter(([,v])=>v!==true).map(([k])=>k);
  const passed=failures.length===0;
  const qc={ contract:"AVANTIQO_MUSIC_PROFESSIONAL_PREMASTER_QC_V2", passed, checks, failures, mix_asset_id:mixAssetId, validated_at:new Date().toISOString(), signal_review:signalReview, repair_targets:signalReview.repair_targets, mastering_allowed:passed, measured_from_saved_premaster:true };
  await CreativeAssetsRuntime.update(mixAssetId,{ metadata:{ ...(mixAsset.metadata || {}), professional_premaster_qc:qc, professional_premaster_qc_passed:passed } });
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_mix_passed:true, professional_mix_asset_id:mixAssetId, professional_premaster_qc_passed:passed, professional_premaster_qc:qc } });
  return { contract:CONTRACT, status:passed?"PASS":"REPAIR_REQUIRED", mix_asset_id:mixAssetId, professional_mix_passed:passed, premaster_qc:qc, mastering_allowed:passed };
}


export async function applyProfessionalPremasterRepair(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  if(!organizationId || !projectId || !sourceAssetId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_REPAIR_CONTEXT_REQUIRED");
  const [project,sourceAsset]=await Promise.all([CreativeProjectRepository.getById(projectId),CreativeAssetsRuntime.get(sourceAssetId)]);
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || text(sourceAsset.organization_id)!==organizationId || assetProjectId(sourceAsset)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_REPAIR_SCOPE_MISMATCH");
  const qc=sourceAsset.metadata?.professional_premaster_qc; const repairs=Array.isArray(qc?.repair_targets)?qc.repair_targets:[];
  if(!repairs.length || qc?.passed===true) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_REPAIR_NOT_REQUIRED");
  const current=ensureMusicEngineeringBuses(structuredClone(project.metadata?.[MULTITRACK_KEY]||{})); validateMusicMultitrackProject(current); validateMusicMixerRouting(current);
  const next=structuredClone(current); const applied=[];
  const role=(track={})=>{const hay=`${text(track.type)} ${text(track.name)}`.toLowerCase();if(/bass|sub/.test(hay))return"BASS";if(/kick|drum|snare|perc/.test(hay))return"DRUMS";if(/vocal|lead|vox|singer/.test(hay))return"VOCAL";if(/guitar|keys|piano|synth|pad|backing|stem|music|instrument/.test(hay))return"SUPPORT";return"OTHER";};
  for(const repair of repairs){
    if(repair.code==="RESTORE_PREMASTER_HEADROOM"){const master=(next.buses||[]).find(b=>b.id==="bus-master");if(master){master.gain_db=Math.max(-18,finite(master.gain_db,0)-1.5);applied.push({code:repair.code,change_db:-1.5});}}
    else if(repair.code==="RESTORE_DYNAMIC_LIFE" && repair.direction==="LESS_COMPRESSION"){for(const track of next.tracks||[]){const c=track.channel_strip?.compressor;if(c?.enabled===true){c.ratio=Math.max(1,Number((finite(c.ratio,2.5)*0.85).toFixed(2)));c.threshold_db=Math.min(0,finite(c.threshold_db,-18)+1);}}applied.push({code:repair.code,change:"REDUCED_TRACK_COMPRESSION"});}
    else if(repair.code==="REBALANCE_LOW_END"){for(const track of next.tracks||[]){if(role(track)!=="BASS")continue;track.channel_strip.low_shelf_db=Math.max(-12,Math.min(12,finite(track.channel_strip?.low_shelf_db,0)+(repair.direction==="REDUCE_LOW_END"?-1:0.75)));track.gain_db=Math.max(-60,Math.min(12,finite(track.gain_db,0)+(repair.direction==="REDUCE_LOW_END"?-0.5:0.25)));}applied.push({code:repair.code,direction:repair.direction});}
    else if(repair.code==="REDUCE_UPPER_MID_HARSHNESS"){for(const track of next.tracks||[]){if(!["VOCAL","SUPPORT"].includes(role(track)))continue;track.channel_strip.presence_db=Math.max(-12,finite(track.channel_strip?.presence_db,0)-1);}applied.push({code:repair.code,change_db:-1});}
    else if(repair.code==="REPAIR_STEREO_COMPATIBILITY"){for(const track of next.tracks||[])track.pan=Number((finite(track.pan,0)*0.85).toFixed(4));applied.push({code:repair.code,width_scale:0.85});}
  }
  if(!applied.length) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_REPAIR_NO_SAFE_CHANGES");
  const previousRevision=Math.max(0,Math.round(finite(current.revision,0))); next.revision=previousRevision+1;
  const snapshot={contract:"AVANTIQO_MUSIC_PREMASTER_REPAIR_SNAPSHOT_V1",created_at:new Date().toISOString(),session:current,premaster_qc:qc,immutable:true,reversible:true};
  const history=[...(Array.isArray(project.metadata?.music_premaster_repair_history)?project.metadata.music_premaster_repair_history:[]),snapshot].slice(-12);
  await CreativeProjectRepository.update(projectId,{metadata:{...(project.metadata||{}),[MULTITRACK_KEY]:next,music_premaster_repair_history:history,music_premaster_repair_updated_at:new Date().toISOString(),music_multitrack_updated_at:new Date().toISOString()}});
  await CreativeAssetsRuntime.update(sourceAssetId,{metadata:{...(sourceAsset.metadata||{}),professional_mix_passed:false,professional_premaster_qc_passed:false,professional_mix_asset_id:null,professional_premaster_qc:{...qc,invalidated_by_repair:true,invalidated_at:new Date().toISOString()},professional_premaster_repair:{contract:"AVANTIQO_MUSIC_PREMASTER_REPAIR_V1",source_revision:previousRevision,new_revision:next.revision,applied,requires_new_mix_render:true,artistic_listening_review_required:true}}});
  return {contract:CONTRACT,status:"REPAIRED",source_revision:previousRevision,new_revision:next.revision,applied,requires_new_mix_render:true,old_premaster_stale:true,reversible:true};
}
export const CreativeMusicProfessionalMixRuntime=Object.freeze({ contract:CONTRACT, prepare:prepareProfessionalMix, acceptMixRender:acceptProfessionalMixRender, certifyPremaster:certifyProfessionalPremaster, repairPremaster:applyProfessionalPremasterRepair });
