import { executeService } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { UsageRuntime } from "@/lib/platform/service-runtime/usage/UsageRuntime";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { buildMusicTransformationPlan, MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT } from "@/lib/creative/runtime/engines/MusicEngine";
import { createMusicClip, createMusicMultitrackProject, createMusicTrack, validateMusicMultitrackProject } from "./CreativeMusicMultitrackRuntime.js";
import { ensureMusicEngineeringBuses, validateMusicMixerRouting } from "./CreativeMusicMixerRoutingRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_PROFESSIONAL_STEMS_V1";
const MULTITRACK_KEY = "music_multitrack_project";
const STEM_KEYS = Object.freeze(["vocals", "drums", "bass", "other"]);
function text(v){ return String(v ?? "").trim(); }
function finite(v,f=null){ const n=Number(v); return Number.isFinite(n)?n:f; }
function object(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
function publicAsset(asset){ return asset ? { id:asset.id, title:asset.title || asset.name || null, file_url:asset.file_url || null, asset_type:asset.asset_type || null, metadata:asset.metadata || {} } : null; }
function outputPayload(result={}){ const first=object(result.output); return object(first.output || first); }

async function persistStems({ organizationId, projectId, missionId, usage, result, title, sourceAudio, durationSeconds }) {
  const output=outputPayload(result); const assets=object(output.assets); const refs=object(output.storage_references || output.storageReferences);
  const existing=await CreativeAssetsRuntime.list({ organization_id:organizationId, creative_project_id:projectId, limit:1000 });
  const byKey=new Map(existing.filter(a=>text(a.metadata?.professional_stem_usage_id)===text(usage?.id)).map(a=>[text(a.metadata?.stem),a]));
  const persisted=[];
  for(const key of STEM_KEYS){
    const reference=text(assets[key]?.storage_reference || refs[key]); if(!reference) continue;
    if(byKey.has(key)){ persisted.push(byKey.get(key)); continue; }
    persisted.push(await CreativeAssetsRuntime.create({
      organization_id:organizationId, creative_project_id:projectId, creative_mission_id:missionId || null,
      asset_type:"MUSIC_STEM", file_url:reference, file_name:`${key}.wav`, title:`${title} - ${key}`,
      description:`Professional Release ${key} stem separated from the preserved source master.`, ai_generated:false,
      provider:"avantiqo-audio", engine:"demucs-htdemucs-ft", tags:["music","professional-release","stem",key],
      metadata:{ media_kind:"MUSIC", music_asset_kind:"PROFESSIONAL_STEM", stem:key, storage_reference:reference,
        professional_stem:true, professional_stem_usage_id:usage?.id || null, separator_quality_profile:"DEMUCS_HTDEMUCS_FT_4STEM_V1",
        source_audio:sourceAudio, source_rights_attested:true, source_rights_attestation_contract:MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT,
        duration_seconds:durationSeconds, immutable_source:true, destructive_edit:false }
    }));
  }
  return persisted;
}

function stemTrackType(key){ return key === "vocals" ? "vocal" : key; }
async function importStemsToMultitrack({ organizationId, projectId, assets, durationSeconds, bpm=96, timeSignature="4/4" }) {
  const project=await CreativeProjectRepository.getById(projectId);
  if(!project || text(project.organization_id)!==text(organizationId)) throw new Error("CREATIVE_MUSIC_PRO_STEMS_PROJECT_NOT_FOUND");
  const current=project.metadata?.[MULTITRACK_KEY] || createMusicMultitrackProject({ id:`music-multitrack-${project.id}`, title:project.name || project.title || "Music Project", bpm, time_signature:timeSignature, sample_rate:48000 });
  const next=ensureMusicEngineeringBuses(structuredClone(current));
  const existingSourceIds=new Set((next.tracks || []).flatMap(t=>(t.clips || []).map(c=>text(c.source_asset_id))).filter(Boolean));
  const imported=[];
  for(const asset of assets){
    if(existingSourceIds.has(text(asset.id))) continue;
    const key=text(asset.metadata?.stem || "other").toLowerCase();
    const track=createMusicTrack({ type:stemTrackType(key), name:`${key.charAt(0).toUpperCase()}${key.slice(1)} Stem`, armed:false });
    const clip=createMusicClip({ source_asset_id:asset.id, source_version:0, start_seconds:0, duration_seconds:durationSeconds, source_offset_seconds:0, gain_db:0, fade_in_seconds:0, fade_out_seconds:0 });
    track.clips.push(clip); next.tracks.push(track); imported.push({ stem:key, asset_id:asset.id, track_id:track.id, clip_id:clip.id });
  }
  next.revision=Math.max(0,Math.round(finite(current.revision,0)))+1;
  validateMusicMultitrackProject(next); validateMusicMixerRouting(next);
  const metadata={ ...(project.metadata || {}), [MULTITRACK_KEY]:next, music_bpm:next.bpm, music_time_signature:next.time_signature,
    music_multitrack_updated_at:new Date().toISOString(), professional_stems_ready:assets.length>=2,
    professional_stem_asset_ids:assets.map(a=>a.id), professional_stems_imported_at:new Date().toISOString() };
  await CreativeProjectRepository.update(project.id,{ metadata });
  return { contract:"AVANTIQO_MUSIC_PROFESSIONAL_STEM_IMPORT_V1", revision:next.revision, imported, track_count:next.tracks.length, stem_count:assets.length };
}

export async function executeProfessionalStemSeparation(input={}) {
  const organizationId=text(input.organization_id), projectId=text(input.creative_project_id), sourceAudio=text(input.source_audio || input.source_media || input.file_url), sourceAssetId=text(input.source_asset_id);
  const durationSeconds=finite(input.duration_seconds || input.source_duration_seconds,null);
  if(!organizationId || !projectId || !sourceAudio) throw new Error("CREATIVE_MUSIC_PRO_STEMS_CONTEXT_REQUIRED");
  if(!(durationSeconds>0)) throw new Error("CREATIVE_MUSIC_PRO_STEMS_DURATION_REQUIRED");
  const plan=buildMusicTransformationPlan("stems", { ...input, source_audio:sourceAudio, source_duration_seconds:durationSeconds,
    rights_attestation:{ contract:MUSIC_SOURCE_AUDIO_RIGHTS_ATTESTATION_CONTRACT, confirmed:input.source_rights_confirmed === true || input.rights_attestation?.confirmed === true } });
  if(plan.executable!==true || plan.certification!=="CERTIFIED") throw new Error(`CREATIVE_MUSIC_PRO_STEMS_NOT_CERTIFIED:${plan.certification || "NOT_READY"}`);
  const result=await executeService({ organization_id:organizationId, bill_to_organization_id:organizationId, entity_id:text(input.entity_id)||null,
    service_id:plan.service_id, capability:plan.capability,
    input:{ title:text(input.title || "Professional stems"), quantity:durationSeconds, currency:text(input.currency || "THB"), source_audio:plan.source_audio,
      rights_attestation:plan.rights_attestation, requirements:{ output_spec:plan.output_spec, rights_attestation:plan.rights_attestation }, output_spec:plan.output_spec,
      provider_parameters:{ ...(plan.provider_parameters || {}), export_stems:true } },
    metadata:{ module:"CREATIVE", operation:"AVANTIQO_MUSIC_PROFESSIONAL_STEMS", creative_project_id:projectId, creative_mission_id:text(input.creative_mission_id)||null,
      professional_release:true, source_rights_attested:true, provider_selection_exposed:false },
    provider_policy:{ preferred_providers:["avantiqo-audio"], allowed_providers:["avantiqo-audio"] }, category:"AI" });
  if(result?.pending===true || result?.failed===true) return { contract:CONTRACT, success:result?.failed!==true, pending:result?.pending===true, failed:result?.failed===true, usage_id:result?.usage?.id || null, provider_status:result?.provider_status || null, assets:[], multitrack:null };
  const usage=result?.usage?.id ? await UsageRuntime.get(result.usage.id) : result?.usage || null;
  const stems=await persistStems({ organizationId, projectId, missionId:text(input.creative_mission_id)||null, usage, result, title:text(input.title || "Music"), sourceAudio, durationSeconds });
  const multitrack=await importStemsToMultitrack({ organizationId, projectId, assets:stems, durationSeconds, bpm:finite(input.bpm,96), timeSignature:text(input.time_signature || input.timesignature || "4/4") });
  if(sourceAssetId){
    const sourceAsset=await CreativeAssetsRuntime.get(sourceAssetId);
    if(!sourceAsset || text(sourceAsset.organization_id)!==organizationId || text(sourceAsset.creative_project_id)!==projectId) throw new Error("CREATIVE_MUSIC_PRO_STEMS_SOURCE_ASSET_SCOPE_MISMATCH");
    await CreativeAssetsRuntime.update(sourceAssetId,{ metadata:{ ...(sourceAsset.metadata || {}), professional_stems_ready:stems.length>=2, professional_stems:stems.map(a=>a.id), professional_stem_usage_id:usage?.id || null, professional_stems_completed_at:new Date().toISOString() } });
  }
  return { contract:CONTRACT, success:true, pending:false, failed:false, usage_id:usage?.id || null, provider_status:result?.provider_status || "completed", assets:stems.map(publicAsset), multitrack,
    professional_evidence:{ stems_ready:stems.length>=2, stems:stems.map(a=>a.id), source_asset_id:sourceAssetId || null } };
}

export const CreativeMusicProfessionalStemRuntime=Object.freeze({ contract:CONTRACT, execute:executeProfessionalStemSeparation, importStemsToMultitrack });
