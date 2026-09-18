const CONTRACT="AVANTIQO_PROFESSIONAL_AUDIO_ENGINE_V1";

const ROOMS=Object.freeze([
  {id:"MUSIC_PRODUCTION",name:"Music Production",description:"Songs, scoring, recording, vocal/instrument production, editing and music mixing.",default_mode:"workstation",mode_ids:["compose","record","producer","arrange","midi","vocal","mix","workstation"]},
  {id:"SOUND_DESIGN",name:"Sound Design",description:"Layered cinematic sound objects, SFX, Foley, ambience, sonic branding and designed texture.",default_mode:"sfx",mode_ids:["sfx","audio-video","workstation","cleanup","elastic"]},
  {id:"AUDIO_POST",name:"Audio Post",description:"Picture lock, dialogue/VO/ADR, Foley, effects, ambience, music edit, spatial automation and re-recording mix.",default_mode:"audio-video",mode_ids:["audio-video","workstation","cleanup","mix"]},
  {id:"MASTERING_DELIVERY",name:"Mastering & Delivery",description:"Stereo, 5.1 and 7.1 mastering, post stems, M&E, QC and final delivery packaging.",default_mode:"master",mode_ids:["mix","master","deliverables","stems","workstation"]},
]);
export function listProfessionalAudioRooms(){return ROOMS.map(room=>({...room,mode_ids:[...room.mode_ids]}));}

const ROLES=Object.freeze({
  DIALOGUE:{id:"DIALOGUE",short:"DX",label:"Dialogue",post:true,music:false,me_included:false},
  VOICEOVER:{id:"VOICEOVER",short:"VO",label:"Voice Over",post:true,music:false,me_included:false},
  ADR:{id:"ADR",short:"ADR",label:"ADR",post:true,music:false,me_included:false},
  MUSIC:{id:"MUSIC",short:"MX",label:"Music",post:true,music:true,me_included:true},
  EFFECTS:{id:"EFFECTS",short:"FX",label:"Effects",post:true,music:false,me_included:true},
  FOLEY:{id:"FOLEY",short:"FOL",label:"Foley",post:true,music:false,me_included:true},
  AMBIENCE:{id:"AMBIENCE",short:"AMB",label:"Ambience",post:true,music:false,me_included:true},
  SONIC_BRAND:{id:"SONIC_BRAND",short:"SB",label:"Sonic Brand",post:true,music:true,me_included:true},
  SONG_VOCAL:{id:"SONG_VOCAL",short:"VOC",label:"Song Vocal",post:false,music:true,me_included:true},
  INSTRUMENT:{id:"INSTRUMENT",short:"INST",label:"Instrument",post:false,music:true,me_included:true},
  PROGRAM:{id:"PROGRAM",short:"PGM",label:"Program",post:false,music:false,me_included:true},
});
const ROLE_IDS=Object.freeze(Object.keys(ROLES));
export function listProfessionalAudioRoles(){return ROLE_IDS.map(id=>({...ROLES[id]}));}
const POST_STEMS=Object.freeze({
  DIALOGUE:{id:"DIALOGUE",label:"Dialogue (DX)",roles:["DIALOGUE"],delivery_code:"DX"},
  VOICEOVER:{id:"VOICEOVER",label:"Voice Over (VO)",roles:["VOICEOVER"],delivery_code:"VO"},
  ADR:{id:"ADR",label:"ADR",roles:["ADR"],delivery_code:"ADR"},
  MUSIC:{id:"MUSIC",label:"Music (MX)",roles:["MUSIC","SONIC_BRAND","SONG_VOCAL","INSTRUMENT"],delivery_code:"MX"},
  EFFECTS:{id:"EFFECTS",label:"Effects (FX)",roles:["EFFECTS"],delivery_code:"FX"},
  FOLEY:{id:"FOLEY",label:"Foley",roles:["FOLEY"],delivery_code:"FOL"},
  AMBIENCE:{id:"AMBIENCE",label:"Ambience",roles:["AMBIENCE"],delivery_code:"AMB"},
  ME:{id:"ME",label:"Music & Effects (M&E)",roles:ROLE_IDS.filter(id=>ROLES[id].me_included===true),delivery_code:"ME"},
  FULL_PROGRAM:{id:"FULL_PROGRAM",label:"Full Program",roles:[...ROLE_IDS],delivery_code:"PGM"},
});
function text(v){return String(v??"").trim();}
export function normalizeProfessionalAudioRole(value,fallback="PROGRAM"){const id=text(value||fallback).toUpperCase();if(!ROLES[id])throw new Error(`CREATIVE_PRO_AUDIO_ROLE_INVALID:${id}`);return id;}
export function professionalAudioRoleRecord(value){const id=normalizeProfessionalAudioRole(value);return {...ROLES[id]};}
export function normalizeProfessionalAudioTrack(track={}){return{...track,audio_role:normalizeProfessionalAudioRole(track.audio_role,track.type==="vocal"?"SONG_VOCAL":track.type==="instrument"||track.type==="midi"?"INSTRUMENT":"PROGRAM")};}
export function professionalAudioStemDefinition(stemId){const id=text(stemId).toUpperCase();const stem=POST_STEMS[id];if(!stem)throw new Error(`CREATIVE_PRO_AUDIO_STEM_INVALID:${id}`);return{...stem,roles:[...stem.roles]};}
export function tracksForProfessionalAudioStem(tracks=[],stemId){const stem=professionalAudioStemDefinition(stemId);return (tracks||[]).filter(track=>track?.mute!==true&&stem.roles.includes(normalizeProfessionalAudioRole(track.audio_role,track.type==="vocal"?"SONG_VOCAL":track.type==="instrument"||track.type==="midi"?"INSTRUMENT":"PROGRAM")));}
export function buildProfessionalAudioDeliveryManifest(session={}){const tracks=(session.tracks||[]).map(normalizeProfessionalAudioTrack);const stems=Object.values(POST_STEMS).map(stem=>{const selected=tracksForProfessionalAudioStem(tracks,stem.id);return{id:stem.id,label:stem.label,delivery_code:stem.delivery_code,roles:[...stem.roles],track_ids:selected.map(x=>x.id),available:selected.length>0,source_asset_ids:[...new Set(selected.flatMap(track=>(track.clips||[]).map(clip=>text(clip.source_asset_id)).filter(Boolean)))].sort()};});return{contract:"AVANTIQO_PROFESSIONAL_AUDIO_DELIVERY_MANIFEST_V1",engine_contract:CONTRACT,track_count:tracks.length,roles:tracks.map(track=>({track_id:track.id,audio_role:track.audio_role})),stems,me:{required_for_audio_post:true,dialogue_excluded:true,voiceover_excluded:true,adr_excluded:true,music_included:true,effects_included:true,foley_included:true,ambience_included:true},original_sources_preserved:true,role_inference_from_track_name_forbidden:true};}
export const CreativeProfessionalAudioEngineRuntime=Object.freeze({contract:CONTRACT,roles:ROLES,stemDefinitions:POST_STEMS,normalizeRole:normalizeProfessionalAudioRole,normalizeTrack:normalizeProfessionalAudioTrack,stem:professionalAudioStemDefinition,tracksForStem:tracksForProfessionalAudioStem,deliveryManifest:buildProfessionalAudioDeliveryManifest,listRoles:listProfessionalAudioRoles,listRooms:listProfessionalAudioRooms});
