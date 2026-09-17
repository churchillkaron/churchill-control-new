import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { buildMusicReleaseRenderPlan } from "./CreativeMusicReleaseRenderPlanRuntime.js";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "./CreativeMusicMixerRoutingRuntime.js";
import { validateMusicMultitrackProject } from "./CreativeMusicMultitrackRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_PROFESSIONAL_MIX_V1";
const MULTITRACK_KEY = "music_multitrack_project";
function text(v){ return String(v ?? "").trim(); }
function finite(v,f=null){ const n=Number(v); return Number.isFinite(n)?n:f; }

export async function prepareProfessionalMix(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  if(!organizationId || !projectId || !sourceAssetId) throw new Error("CREATIVE_MUSIC_PRO_MIX_CONTEXT_REQUIRED");
  const project=await CreativeProjectRepository.getById(projectId); const sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || text(sourceAsset.organization_id)!==organizationId || text(sourceAsset.creative_project_id)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_MIX_SCOPE_MISMATCH");
  if(sourceAsset.metadata?.professional_vocal_production_passed!==true && input.instrumental!==true) throw new Error("CREATIVE_MUSIC_PRO_MIX_VOCAL_PRODUCTION_REQUIRED");
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
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || !mixAsset || text(sourceAsset.organization_id)!==organizationId || text(mixAsset.organization_id)!==organizationId || text(sourceAsset.creative_project_id)!==projectId || text(mixAsset.creative_project_id)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_MIX_ACCEPT_SCOPE_MISMATCH");
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
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || !mixAsset || text(sourceAsset.organization_id)!==organizationId || text(mixAsset.organization_id)!==organizationId || text(sourceAsset.creative_project_id)!==projectId || text(mixAsset.creative_project_id)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_SCOPE_MISMATCH");
  if(text(mixAsset.metadata?.music_asset_kind)!=="MIX_RENDER") throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_MIX_RENDER_REQUIRED");
  if(sourceAsset.metadata?.professional_mix_passed!==true || text(sourceAsset.metadata?.professional_mix_asset_id)!==mixAssetId) throw new Error("CREATIVE_MUSIC_PRO_PREMASTER_ACCEPTED_MIX_REQUIRED");
  const currentRevision=Math.max(0,Math.round(finite(project.metadata?.[MULTITRACK_KEY]?.revision,0))); const mixRevision=Math.max(0,Math.round(finite(mixAsset.metadata?.project_revision,-1)));
  const checks={ project_revision_current:mixRevision===currentRevision, no_clipping:mixAsset.metadata?.clipping!==true, full_mix_processing_applied:mixAsset.metadata?.full_mix_processing_applied===true,
    release_limiter_not_applied:mixAsset.metadata?.release_limiter_applied===false, true_peak_not_falsely_certified:mixAsset.metadata?.true_peak_certified!==true,
    sample_rate_valid:finite(mixAsset.metadata?.sample_rate,0)>=44100, stereo:Math.round(finite(mixAsset.metadata?.channels,0))===2,
    peak_evidence_present:Number.isFinite(Number(mixAsset.metadata?.peak_dbfs)), rms_evidence_present:Number.isFinite(Number(mixAsset.metadata?.rms_dbfs)) };
  const failures=Object.entries(checks).filter(([,v])=>v!==true).map(([k])=>k);
  const passed=failures.length===0;
  const qc={ contract:"AVANTIQO_MUSIC_PROFESSIONAL_PREMASTER_QC_V1", passed, checks, failures, mix_asset_id:mixAssetId, validated_at:new Date().toISOString(), mastering_allowed:passed };
  await CreativeAssetsRuntime.update(mixAssetId,{ metadata:{ ...(mixAsset.metadata || {}), professional_premaster_qc:qc, professional_premaster_qc_passed:passed } });
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_mix_passed:true, professional_mix_asset_id:mixAssetId, professional_premaster_qc_passed:passed, professional_premaster_qc:qc } });
  return { contract:CONTRACT, status:passed?"PASS":"REPAIR_REQUIRED", mix_asset_id:mixAssetId, professional_mix_passed:passed, premaster_qc:qc, mastering_allowed:passed };
}

export const CreativeMusicProfessionalMixRuntime=Object.freeze({ contract:CONTRACT, prepare:prepareProfessionalMix, acceptMixRender:acceptProfessionalMixRender, certifyPremaster:certifyProfessionalPremaster });
