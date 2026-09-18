import { musicFramesToSeconds, musicFramesToSmpte, musicSecondsToFrames } from "./CreativeMusicPictureLockRuntime.js";

const CONTRACT="AVANTIQO_AUDIO_POST_EDITORIAL_V1";
const LANGUAGE_ROLES=new Set(["DIALOGUE","VOICEOVER","ADR"]);
function text(v){return String(v??"").trim();}function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}function clamp(v,min,max,f=0){return Math.max(min,Math.min(max,finite(v,f)));}
export function isLanguageAudioRole(role){return LANGUAGE_ROLES.has(text(role).toUpperCase());}
export function normalizeAudioPostClipEditorial(input={},context={}){
  const fps=Math.max(1,finite(context.frame_rate,24)),timelineStart=Math.max(0,finite(context.timeline_start_seconds,0));
  const syncFrame=Math.max(0,Math.round(finite(input.sync_frame,musicSecondsToFrames(timelineStart,fps))));
  return{contract:CONTRACT,language:text(input.language||"und").slice(0,32),speaker:text(input.speaker).slice(0,120)||null,character:text(input.character).slice(0,120)||null,scene_id:text(input.scene_id).slice(0,80)||null,line_id:text(input.line_id).slice(0,80)||null,take_id:text(input.take_id).slice(0,80)||null,production_sound:input.production_sound!==false,adr_status:["NONE","NEEDED","CUED","RECORDED","EDITED","APPROVED"].includes(text(input.adr_status).toUpperCase())?text(input.adr_status).toUpperCase():"NONE",sync_frame:syncFrame,sync_timecode:musicFramesToSmpte(syncFrame,fps),sync_seconds:musicFramesToSeconds(syncFrame,fps),sync_tolerance_frames:Math.max(0,Math.round(clamp(input.sync_tolerance_frames,0,24,1))),pre_handle_frames:Math.max(0,Math.round(clamp(input.pre_handle_frames,0,240,12))),post_handle_frames:Math.max(0,Math.round(clamp(input.post_handle_frames,0,240,12))),room_tone_asset_id:text(input.room_tone_asset_id)||null,alternate_take_asset_ids:[...new Set((Array.isArray(input.alternate_take_asset_ids)?input.alternate_take_asset_ids:[]).map(text).filter(Boolean))],noise_reduction_note:text(input.noise_reduction_note).slice(0,500)||null,continuity_note:text(input.continuity_note).slice(0,500)||null,dialogue_edit_approved:input.dialogue_edit_approved===true,source_asset_preserved:true,destructive_edit:false};
}
export function validateAudioPostClipEditorial(track={},clip={},pictureLock=null){
  if(!isLanguageAudioRole(track.audio_role))return{success:true,required:false};
  const fps=finite(pictureLock?.frame_rate,24),editorial=normalizeAudioPostClipEditorial(clip.audio_post||{}, {frame_rate:fps,timeline_start_seconds:clip.start_seconds});const failures=[];
  if(!editorial.speaker&&!editorial.character)failures.push("AUDIO_POST_SPEAKER_OR_CHARACTER_REQUIRED");
  if(editorial.language==="und")failures.push("AUDIO_POST_LANGUAGE_REQUIRED");
  if(track.audio_role==="ADR"&&editorial.adr_status==="NONE")failures.push("AUDIO_POST_ADR_STATUS_REQUIRED");
  if(pictureLock?.picture_lock_digest){const maxFrame=Math.max(0,Math.round(finite(pictureLock.frame_count,musicSecondsToFrames(pictureLock.duration_seconds,fps))));if(editorial.sync_frame>maxFrame)failures.push("AUDIO_POST_SYNC_FRAME_OUTSIDE_PICTURE");}
  return{success:failures.length===0,required:true,contract:"AVANTIQO_AUDIO_POST_EDITORIAL_VALIDATION_V1",failures,editorial};
}
export function validateAudioPostSessionEditorial(session={}){const failures=[];let languageClipCount=0,approvedClipCount=0;for(const track of session.tracks||[]){if(!isLanguageAudioRole(track.audio_role))continue;for(const clip of track.clips||[]){languageClipCount++;const result=validateAudioPostClipEditorial(track,clip,session.picture_lock||null);if(!result.success)for(const code of result.failures)failures.push(`${code}:${track.id}:${clip.id}`);if(result.editorial?.dialogue_edit_approved===true)approvedClipCount++;}}return{success:failures.length===0,contract:"AVANTIQO_AUDIO_POST_SESSION_EDITORIAL_VALIDATION_V1",language_clip_count:languageClipCount,approved_clip_count:approvedClipCount,failures,picture_lock_bound:Boolean(session.picture_lock?.picture_lock_digest),destructive_processing:false};}
export const CreativeAudioPostEditorialRuntime=Object.freeze({contract:CONTRACT,isLanguageRole:isLanguageAudioRole,normalize:normalizeAudioPostClipEditorial,validateClip:validateAudioPostClipEditorial,validateSession:validateAudioPostSessionEditorial});
