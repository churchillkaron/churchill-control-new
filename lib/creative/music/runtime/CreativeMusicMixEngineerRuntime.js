const CONTRACT = "AVANTIQO_MUSIC_MIX_ENGINEER_V1";
const SNAPSHOT_CONTRACT = "AVANTIQO_MUSIC_MIX_ENGINEER_SNAPSHOT_V1";
function text(v){return String(v??"").trim();}
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,min,max,f=0){return Math.max(min,Math.min(max,finite(v,f)));}
function role(track={}){
  const hay=`${text(track.type)} ${text(track.name)}`.toLowerCase();
  if(/vocal|lead|vox|singer/.test(hay)) return "VOCAL";
  if(/bass|sub/.test(hay)) return "BASS";
  if(/kick|drum|snare|perc/.test(hay)) return "DRUMS";
  if(/guitar/.test(hay)) return "GUITAR";
  if(/keys|piano|synth|pad/.test(hay)) return "KEYS";
  if(/backing|stem|music|instrument/.test(hay)) return "BACKING";
  return "OTHER";
}
function trackDecision(track={}, evidence={}){
  const r=role(track); const decisions=[];
  const strip=structuredClone(track.channel_strip||{}); strip.compressor={...(strip.compressor||{})};
  let pan=finite(track.pan,0), gain=finite(track.gain_db,0), reverb=null, saturation=null;
  const measured=evidence?.measured===true; const crest=finite(evidence?.crest_proxy_db,null); const subLow=finite(evidence?.sub_vs_lowmid_db,null); const presenceLow=finite(evidence?.presence_vs_lowmid_db,null); const airPresence=finite(evidence?.air_vs_presence_db,null);
  if(r==="VOCAL"){
    strip.high_pass_hz=Math.max(finite(strip.high_pass_hz,20),75); const presenceLift=measured&&presenceLow>2?0.5:1.5; const airLift=measured&&airPresence>0?0.25:0.75; strip.presence_db=clamp(finite(strip.presence_db,0)+presenceLift,-12,12); strip.high_shelf_db=clamp(finite(strip.high_shelf_db,0)+airLift,-12,12);
    const vocalRatio=measured&&crest!==null&&crest<8?2.2:3; strip.compressor={...strip.compressor,enabled:true,threshold_db:-20,ratio:vocalRatio,attack_ms:18,release_ms:110,knee_db:6,makeup_db:1.5};
    pan=clamp(pan,-0.08,0.08); reverb={level_db:-17}; saturation={drive_db:2.5,mix:0.12,output_db:0};
    decisions.push("center vocal image","gentle vocal compression","presence/air lift","short cohesive space");
  } else if(r==="BASS"){
    strip.high_pass_hz=Math.max(25,finite(strip.high_pass_hz,20)); const lowLift=measured&&subLow>3?0:0.75; strip.low_shelf_db=clamp(finite(strip.low_shelf_db,0)+lowLift,-12,12); strip.presence_db=clamp(finite(strip.presence_db,0)-0.5,-12,12);
    strip.compressor={...strip.compressor,enabled:true,threshold_db:-18,ratio:3.5,attack_ms:25,release_ms:140,knee_db:5,makeup_db:0}; pan=0;
    decisions.push("mono-compatible low-end anchor","controlled sustain","preserve attack");
  } else if(r==="DRUMS"){
    strip.high_pass_hz=Math.max(28,finite(strip.high_pass_hz,20)); strip.compressor={...strip.compressor,enabled:true,threshold_db:-16,ratio:2.5,attack_ms:28,release_ms:90,knee_db:4,makeup_db:0.5}; saturation={drive_db:2,mix:0.08,output_db:0};
    decisions.push("transient preservation","gentle glue","subtle harmonic density");
  } else if(["GUITAR","KEYS","BACKING"].includes(r)){
    strip.high_pass_hz=Math.max(r==="KEYS"?55:70,finite(strip.high_pass_hz,20)); if(Math.abs(pan)<0.12) pan=r==="GUITAR"?-0.18:0.18; reverb={level_db:-21};
    decisions.push("clear low-mid space","supporting stereo placement","shared depth");
  }
  return {track_id:track.id,track_name:track.name||"Track",role:r,gain_db:gain,pan,channel_strip:strip,reverb_send:reverb,saturation,decisions,evidence:measured?evidence:null,evidence_measured:measured,changed:decisions.length>0};
}
export function analyzeMusicMixEngineer(session={}, evidenceBundle={}){
  const evidenceById=new Map((evidenceBundle?.tracks||[]).map(row=>[row.track_id,row]));
  const tracks=(session.tracks||[]).filter(t=>t.mute!==true).map(track=>trackDecision(track,evidenceById.get(track.id)||{}));
  const vocalCount=tracks.filter(t=>t.role==="VOCAL").length, bassCount=tracks.filter(t=>t.role==="BASS").length;
  const issues=[]; if(vocalCount>1) issues.push({code:"MULTIPLE_VOCAL_TRACKS",message:"Multiple vocal tracks detected; lead/background role confirmation is recommended before aggressive vocal balancing."});
  if(!bassCount) issues.push({code:"LOW_END_ROLE_UNCLEAR",message:"No explicit bass role detected; low-end authority should be reviewed by listening before release."});
  if((session.tracks||[]).some(t=>t.solo===true)) issues.push({code:"SOLO_ACTIVE",message:"Solo is active and should be cleared before judging the full mix."});
  return {contract:CONTRACT,status:tracks.some(t=>t.changed)?"MIX_PLAN_READY":"NO_SAFE_AUTOMATIC_CHANGES",evidence_contract:evidenceBundle?.contract||null,measured_track_count:tracks.filter(t=>t.evidence_measured).length,track_decisions:tracks,issues,principles:["preserve original sources","retain transient life","create vocal hierarchy","protect low-end mono compatibility","use shared depth instead of wash","avoid loudness as a substitute for mix quality"],automatic_mastering_forbidden:true,artistic_listening_review_required:true,mutation_authorized:false};
}
export function applyMusicMixEngineerPlan(session={},plan={}){
  const next=structuredClone(session); const byId=new Map((plan.track_decisions||[]).map(d=>[d.track_id,d]));
  for(const track of next.tracks||[]){const d=byId.get(track.id); if(!d||!d.changed)continue; track.gain_db=d.gain_db; track.pan=d.pan; track.channel_strip=d.channel_strip;
    if(d.reverb_send){track.sends=Array.isArray(track.sends)?track.sends:[]; const i=track.sends.findIndex(s=>s.bus_id==="bus-reverb"); const send={bus_id:"bus-reverb",enabled:true,level_db:d.reverb_send.level_db,pre_fader:false}; if(i>=0)track.sends[i]={...track.sends[i],...send}; else track.sends.push(send);}
    if(d.saturation){track.inserts=Array.isArray(track.inserts)?track.inserts:[]; const i=track.inserts.findIndex(x=>x.type==="saturation"); const insert={id:i>=0?track.inserts[i].id:`mix-saturation-${track.id}`,type:"saturation",enabled:true,bypass:false,parameters:d.saturation}; if(i>=0)track.inserts[i]={...track.inserts[i],...insert}; else track.inserts.push(insert);}
  }
  next.revision=Math.max(0,Math.round(finite(session.revision,0)))+1; next.mix_engineer={contract:CONTRACT,applied_at:new Date().toISOString(),artistic_listening_review_required:true,source_revision:Math.max(0,Math.round(finite(session.revision,0)))}; return next;
}
export function createMusicMixEngineerSnapshot(session={},plan={}){return {contract:SNAPSHOT_CONTRACT,id:`music-mix-snapshot-${crypto.randomUUID()}`,created_at:new Date().toISOString(),session:structuredClone(session),plan:structuredClone(plan),immutable:true,reversible:true};}
export function validateMusicMixEngineerSnapshot(s={}){if(s.contract!==SNAPSHOT_CONTRACT||s.immutable!==true||s.reversible!==true||!s.session)throw new Error("CREATIVE_MUSIC_MIX_ENGINEER_SNAPSHOT_INVALID"); return true;}
export const CreativeMusicMixEngineerRuntime=Object.freeze({contract:CONTRACT,snapshotContract:SNAPSHOT_CONTRACT,analyze:analyzeMusicMixEngineer,apply:applyMusicMixEngineerPlan,snapshot:createMusicMixEngineerSnapshot,validateSnapshot:validateMusicMixEngineerSnapshot});
