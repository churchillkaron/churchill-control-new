import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { processMusicVocalEngineeringLocal } from "./CreativeMusicVocalEngineeringRuntime.js";
import { analyzeMusicVocalPitch } from "./CreativeMusicVocalPitchAnalysisRuntime.js";
import { analyzeMusicVocalTiming } from "./CreativeMusicVocalTimingAnalysisRuntime.js";
import { buildMusicVocalTuningPlan } from "./CreativeMusicVocalTuningPlanRuntime.js";
import { buildMusicVocalTimingPlan } from "./CreativeMusicVocalTimingPlanRuntime.js";
import { validateMusicMultitrackProject } from "./CreativeMusicMultitrackRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_PROFESSIONAL_VOCAL_PRODUCTION_V1";
const MULTITRACK_KEY = "music_multitrack_project";
function text(v){ return String(v ?? "").trim(); }
function assetProjectId(asset={}){ return text(asset.creative_project_id || asset.metadata?.creative_project_id); }
function finite(v,f=null){ const n=Number(v); return Number.isFinite(n)?n:f; }
function object(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function parseMusicalKey(value){ const raw=text(value); const m=raw.match(/^([A-G](?:#|b)?)\s*(major|minor)$/i); return m ? { key:m[1], mode:m[2].toLowerCase(), label:`${m[1]} ${m[2].toLowerCase()}` } : null; }

async function vocalStemInScope(organizationId, projectId, sourceAsset){
  const ids=Array.isArray(sourceAsset.metadata?.professional_stems)?sourceAsset.metadata.professional_stems:[];
  if(!ids.length) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_STEMS_REQUIRED");
  const assets=await CreativeAssetsRuntime.list({ organization_id:organizationId, creative_project_id:projectId, limit:1000 });
  const idSet=new Set(ids.map(text));
  const vocal=assets.find(a=>idSet.has(text(a.id)) && text(a.metadata?.stem).toLowerCase()==="vocals");
  if(!vocal) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_STEM_NOT_FOUND");
  return vocal;
}

async function persistRestoredVocal({ organizationId, projectId, missionId, sourceVocal, restoration }){
  const existing=(await CreativeAssetsRuntime.list({ organization_id:organizationId, creative_project_id:projectId, limit:1000 }))
    .find(a=>text(a.metadata?.professional_vocal_parent_asset_id)===text(sourceVocal.id) && text(a.metadata?.professional_vocal_restoration_checksum)===text(restoration.restored?.checksum));
  if(existing) return existing;
  return CreativeAssetsRuntime.create({ organization_id:organizationId, creative_project_id:projectId, creative_mission_id:missionId || null,
    asset_type:"MUSIC_STEM", file_url:restoration.restored.storage_reference, file_name:"vocals-restored-v1.wav", title:`${sourceVocal.title || "Vocals"} - Restored V1`,
    description:"Locally restored isolated vocal prepared for professional pitch/timing review.", ai_generated:false, provider:"avantiqo-local-audio-worker", engine:"AVANTIQO_MUSIC_VOCAL_ENGINEERING",
    tags:["music","professional-release","vocal","restored"], metadata:{ media_kind:"MUSIC", music_asset_kind:"PROFESSIONAL_VOCAL_PREP", stem:"vocals",
      professional_vocal_parent_asset_id:sourceVocal.id, professional_vocal_restoration_checksum:restoration.restored.checksum || null,
      vocal_engineering_contract:restoration.contract, engineering:restoration.engineering, analysis:restoration.analysis, readiness:restoration.readiness,
      immutable_source:false, parent_source_preserved:true, destructive_edit:false, human_listening_review_required:true } });
}

function attachPlansToVocalClip(session, sourceVocalId, restoredVocalId, pitch, timing, tuningPlan, timingPlan){
  const next=structuredClone(session); let found=null;
  for(const track of next.tracks || []) for(const clip of track.clips || []) if(text(clip.source_asset_id)===text(sourceVocalId)) { found={ track, clip }; break; }
  if(!found) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_MULTITRACK_CLIP_NOT_FOUND");
  found.clip.previous_sources=[...(Array.isArray(found.clip.previous_sources)?found.clip.previous_sources:[]),{ source_asset_id:sourceVocalId, preserved:true, reason:"PROFESSIONAL_VOCAL_RESTORATION" }];
  found.clip.source_asset_id=restoredVocalId;
  found.clip.correction_source_asset_id=sourceVocalId;
  found.clip.vocal_pitch_analysis={ ...pitch, source_asset_id:restoredVocalId };
  found.clip.vocal_timing_analysis={ ...timing, source_asset_id:restoredVocalId };
  found.clip.vocal_tuning_plan=tuningPlan;
  found.clip.vocal_timing_plan=timingPlan;
  found.clip.professional_vocal_production={ status:"REVIEW_REQUIRED", restored_asset_id:restoredVocalId, human_listening_review_required:true };
  found.clip.preserve_source_asset=true; found.clip.destructive_edit=false;
  next.revision=Math.max(0,Math.round(finite(session.revision,0)))+1;
  validateMusicMultitrackProject(next);
  return { session:next, track_id:found.track.id, clip_id:found.clip.id };
}

export async function prepareProfessionalVocalProduction(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id);
  if(!organizationId || !projectId || !sourceAssetId) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_CONTEXT_REQUIRED");
  const project=await CreativeProjectRepository.getById(projectId); const sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
  if(!project || text(project.organization_id)!==organizationId || !sourceAsset || text(sourceAsset.organization_id)!==organizationId || assetProjectId(sourceAsset)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_SCOPE_MISMATCH");
  const session=project.metadata?.[MULTITRACK_KEY]; if(!session) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_MULTITRACK_REQUIRED");
  const existingPrep=object(sourceAsset.metadata?.professional_vocal_preparation); if(existingPrep.contract===CONTRACT && existingPrep.status==="REVIEW_REQUIRED") return { ...existingPrep, idempotent_existing_preparation:true };
  const vocal=await vocalStemInScope(organizationId,projectId,sourceAsset);
  const restoration=await processMusicVocalEngineeringLocal({ organization_id:organizationId, creative_project_id:projectId, source_audio:vocal.file_url, file_name:vocal.file_name || "vocals.wav", mime_type:"audio/wav", source_role:"vocal" });
  const restored=await persistRestoredVocal({ organizationId, projectId, missionId:text(input.creative_mission_id)||null, sourceVocal:vocal, restoration });
  const duration=finite(input.duration_seconds || vocal.metadata?.duration_seconds || sourceAsset.metadata?.duration_seconds,300);
  const bpm=finite(input.bpm || session.bpm,96);
  const pitch=await analyzeMusicVocalPitch({ organization_id:organizationId, source_url:restored.file_url, source_file_name:restored.file_name || "vocals-restored.wav", source_mime_type:"audio/wav", duration_seconds:duration });
  const timing=await analyzeMusicVocalTiming({ organization_id:organizationId, source_url:restored.file_url, source_file_name:restored.file_name || "vocals-restored.wav", source_mime_type:"audio/wav", duration_seconds:duration, bpm, beat_offset_seconds:finite(input.beat_offset_seconds,0) });
  const key=parseMusicalKey(input.keyscale || input.musical_key || sourceAsset.metadata?.music_session?.keyscale);
  const tuningPlan=key ? buildMusicVocalTuningPlan({ pitch_analysis:pitch, musical_key:key, correction_strength:finite(input.pitch_strength,0.72), max_correction_cents:finite(input.max_pitch_shift_cents,160) }) : null;
  const timingPlan=buildMusicVocalTimingPlan({ analysis:{ ...timing, source_asset_id:restored.id, source_duration_seconds:duration } });
  const attached=attachPlansToVocalClip(session,vocal.id,restored.id,pitch,timing,tuningPlan,timingPlan);
  const prep={ contract:CONTRACT, status:"REVIEW_REQUIRED", source_vocal_asset_id:vocal.id, restored_vocal_asset_id:restored.id, track_id:attached.track_id, clip_id:attached.clip_id,
    pitch_analysis_contract:pitch.contract, timing_analysis_contract:timing.contract, tuning_plan_ready:Boolean(tuningPlan), timing_plan_ready:true,
    musical_key:key, human_listening_review_required:true, correction_capability:"ai.audio.vocal-correct", production_passed:false };
  await CreativeProjectRepository.update(projectId,{ metadata:{ ...(project.metadata || {}), [MULTITRACK_KEY]:attached.session, professional_vocal_preparation:prep, music_multitrack_updated_at:new Date().toISOString() } });
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_vocal_preparation:prep, professional_vocal_production_passed:false } });
  return prep;
}

export async function certifyProfessionalVocalProduction(input={}){
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAssetId=text(input.source_asset_id), correctedAssetId=text(input.corrected_vocal_asset_id);
  if(!organizationId || !projectId || !sourceAssetId || !correctedAssetId) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_CERT_CONTEXT_REQUIRED");
  if(input.human_listening_review_approved!==true) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_HUMAN_REVIEW_REQUIRED");
  const [sourceAsset,corrected]=await Promise.all([CreativeAssetsRuntime.get(sourceAssetId),CreativeAssetsRuntime.get(correctedAssetId)]);
  if(!sourceAsset || !corrected || text(sourceAsset.organization_id)!==organizationId || text(corrected.organization_id)!==organizationId || assetProjectId(sourceAsset)!==projectId || assetProjectId(corrected)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_CERT_SCOPE_MISMATCH");
  const restoredVocalAssetId=text(sourceAsset.metadata?.professional_vocal_preparation?.restored_vocal_asset_id);
  if(!restoredVocalAssetId || text(corrected.metadata?.source_asset_id)!==restoredVocalAssetId) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_CERT_LINEAGE_MISMATCH");
  if(!text(corrected.metadata?.vocal_tuning_render_contract)) throw new Error("CREATIVE_MUSIC_PRO_VOCAL_CERT_CORRECTION_EVIDENCE_REQUIRED");
  const evidence={ contract:CONTRACT, status:"PASS", corrected_vocal_asset_id:correctedAssetId, human_listening_review_approved:true, approved_by:text(input.approved_by)||null, approved_at:new Date().toISOString() };
  await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_vocal_production_passed:true, professional_vocal_production_evidence:evidence, professional_corrected_vocal_asset_id:correctedAssetId } });
  return evidence;
}

export const CreativeMusicProfessionalVocalProductionRuntime=Object.freeze({ contract:CONTRACT, prepare:prepareProfessionalVocalProduction, certify:certifyProfessionalVocalProduction });
