export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import * as CreativeProjectRepository from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import { createMusicClip, createMusicMultitrackProject, createMusicTrack, validateMusicMultitrackProject } from "@/lib/creative/music/runtime/CreativeMusicMultitrackRuntime";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { getServiceSupabase } from "@/lib/shared/supabase/service";

const PERMISSIONS=Object.freeze(["creative.execute","creative.production.run","creative.*"]);const KEY="music_multitrack_project";const BUCKET="creative-assets";const MAX_BYTES=1024*1024*1024;
function text(v){return String(v??"").trim();}function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
async function requireAccess(request,organizationId){const access=await requireOrganizationAccess({organizationId,request,requiredAnyPermission:PERMISSIONS});if(!access.success){const e=new Error(access.error||"CREATIVE_MUSIC_MIDI_BOUNCE_ACCESS_FORBIDDEN");e.status=access.status||403;throw e;}}
async function projectInScope(organizationId,projectId){const project=await CreativeProjectRepository.getById(projectId);if(!project||String(project.organization_id)!==String(organizationId)){const e=new Error("CREATIVE_MUSIC_MIDI_BOUNCE_PROJECT_NOT_FOUND");e.status=404;throw e;}return project;}
function defaultSession(project){return createMusicMultitrackProject({id:`music-multitrack-${project.id}`,title:project.name||project.title||"Music Project",bpm:project.metadata?.music_bpm||96,time_signature:project.metadata?.music_time_signature||"4/4",sample_rate:48000});}

async function prepareUpload(body){const organizationId=text(body.organization_id);const size=Math.round(finite(body.size_bytes,-1));if(size<=0||size>MAX_BYTES)throw new Error(`CREATIVE_MUSIC_MIDI_BOUNCE_SIZE_INVALID:max=${MAX_BYTES}`);const path=`${organizationId}/derived/music-midi-bounce/${randomUUID()}-midi-bounce.wav`;const supabase=getServiceSupabase();const {data,error}=await supabase.storage.from(BUCKET).createSignedUploadUrl(path,{upsert:false});if(error)throw error;if(!data?.signedUrl)throw new Error("CREATIVE_MUSIC_MIDI_BOUNCE_UPLOAD_URL_REQUIRED");return{success:true,contract:"AVANTIQO_MUSIC_MIDI_BOUNCE_UPLOAD_V2",upload_url:data.signedUrl,storage_reference:`storage://${BUCKET}/${path}`,provider_job_submitted:false,endpoint_mutation_performed:false};}

async function register(body){
  const organizationId=text(body.organization_id),projectId=text(body.creative_project_id),midiTrackId=text(body.midi_track_id);
  const project=await projectInScope(organizationId,projectId);const current=structuredClone(project.metadata?.[KEY]||defaultSession(project));
  const revision=Math.max(0,Math.round(finite(current.revision,0))),expected=Math.max(0,Math.round(finite(body.expected_revision,-1)));
  if(revision!==expected){const e=new Error(`CREATIVE_MUSIC_MIDI_BOUNCE_REVISION_CONFLICT:expected=${expected}:current=${revision}`);e.status=409;throw e;}
  const midiTrack=current.midi?.tracks?.find((track)=>track.id===midiTrackId);if(!midiTrack)throw new Error("CREATIVE_MUSIC_MIDI_BOUNCE_MIDI_TRACK_NOT_FOUND");
  const storage=text(body.storage_reference);if(!storage.startsWith(`storage://${BUCKET}/${organizationId}/derived/music-midi-bounce/`))throw new Error("CREATIVE_MUSIC_MIDI_BOUNCE_STORAGE_REFERENCE_INVALID");
  const duration=Math.max(.001,finite(body.duration_seconds,0));const bounceContract=text(body.bounce_contract)||"AVANTIQO_MUSIC_MIDI_OFFLINE_BOUNCE_V2";const tempoMapAware=body.tempo_map_aware===true;
  const asset=await CreativeAssetsRuntime.create({organization_id:organizationId,creative_project_id:projectId,asset_type:"AUDIO",file_url:storage,file_name:`${text(midiTrack.name||"midi-track").replace(/[^A-Za-z0-9._-]+/g,"-")}-bounce.wav`,name:`${midiTrack.name||"MIDI Track"} Bounce`,title:`${midiTrack.name||"MIDI Track"} Bounce`,description:"24-bit non-destructive audio bounce rendered from Avantiqo MIDI/instrument performance.",ai_generated:false,provider:"avantiqo-music-midi-bounce",engine:"AVANTIQO_MUSIC_MIDI_OFFLINE_BOUNCE_V2",metadata:{media_kind:"MUSIC",music_asset_kind:"MIDI_BOUNCE",music_midi_bounce_contract:bounceContract,source_midi_track_id:midiTrackId,source_midi_preserved:true,tempo_map_aware:tempoMapAware,tempo_map_contract:text(body.tempo_map_contract)||null,bit_depth:24,sample_rate:Math.round(finite(body.sample_rate,48000)),channels:Math.round(finite(body.channels,2)),duration_seconds:duration,peak_dbfs:finite(body.peak_dbfs,null),rms_dbfs:finite(body.rms_dbfs,null),release_master:false},tags:["music","midi","bounce","24-bit"]});
  const track=createMusicTrack({type:"instrument",name:`${midiTrack.name||"MIDI"} Bounce`,armed:false});
  track.source_midi_track_id=midiTrackId;track.bounce_asset_id=asset.id;track.midi_bounce_contract=bounceContract;track.tempo_map_aware=tempoMapAware;
  track.clips.push(createMusicClip({source_asset_id:asset.id,start_seconds:Math.max(0,finite(body.timeline_start_seconds,0)),duration_seconds:duration,source_offset_seconds:0,gain_db:0,fade_in_seconds:0,fade_out_seconds:0}));
  midiTrack.release_bounce={contract:"AVANTIQO_MUSIC_MIDI_RELEASE_BOUNCE_LINK_V1",asset_id:asset.id,audio_track_id:track.id,bounce_contract:bounceContract,tempo_map_aware:tempoMapAware,created_at:new Date().toISOString(),source_midi_preserved:true};
  current.tracks.push(track);current.revision=revision+1;validateMusicMultitrackProject(current);
  const metadata={...(project.metadata||{}),[KEY]:current,music_multitrack_updated_at:new Date().toISOString()};await CreativeProjectRepository.update(project.id,{metadata});
  return{success:true,contract:"AVANTIQO_MUSIC_MIDI_BOUNCE_REGISTER_V2",revision:current.revision,asset_id:asset.id,audio_track_id:track.id,source_midi_track_id:midiTrackId,source_midi_preserved:true,tempo_map_aware:tempoMapAware,release_bounce_linked:true,added_to_multitrack:true,provider_job_submitted:false,endpoint_mutation_performed:false};
}

export async function POST(request){try{const body=await request.json(),organizationId=text(body.organization_id);if(!organizationId)return NextResponse.json({success:false,error:"organization_id required"},{status:400});await requireAccess(request,organizationId);const action=text(body.action||"prepare_upload").toLowerCase();const result=action==="prepare_upload"?await prepareUpload(body):action==="register"?await register(body):null;if(!result)return NextResponse.json({success:false,error:"CREATIVE_MUSIC_MIDI_BOUNCE_ACTION_INVALID"},{status:400});return NextResponse.json(result,{headers:{"Cache-Control":"no-store"}});}catch(error){return NextResponse.json({success:false,error:error?.message||"MIDI bounce failed",provider_job_submitted:false,endpoint_mutation_performed:false},{status:error?.status||400});}}
