import { createHash } from "node:crypto";
import { buildMusicMixAutomationPlan, applyMusicMixAutomationPlan } from "./CreativeMusicMixAutomationRuntime.js";
const CONTRACT = "AVANTIQO_MUSIC_MIX_ENGINEER_V4";
const BASELINE_CONTRACT = "AVANTIQO_MUSIC_MIX_ENGINEER_BASELINE_V1";
const SNAPSHOT_CONTRACT = "AVANTIQO_MUSIC_MIX_ENGINEER_SNAPSHOT_V1";
function text(v){return String(v??"").trim();}
const MAX_SAFE_MIX_EVIDENCE_MINUTES=10;
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,min,max,f=0){return Math.max(min,Math.min(max,finite(v,f)));}
function measuredCompressorThreshold(evidence={},fallback=-18,min=-32,max=-6){const mean=finite(evidence?.mean_db,null),crest=finite(evidence?.crest_proxy_db,null);if(evidence?.measured!==true||mean===null)return fallback;const offset=crest===null?4:crest<8?Math.max(4,crest*.65):crest>14?Math.max(3,crest*.28):Math.max(3.5,crest*.4);return Number(clamp(mean+offset,min,max,fallback).toFixed(1));}

function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==="object"){return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key]) ]));}return value;}
function hash(value){return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");}
function trackControlState(track={}){return {id:track.id,type:track.type||null,name:track.name||null,gain_db:finite(track.gain_db,0),pan:finite(track.pan,0),channel_strip:structuredClone(track.channel_strip||{}),inserts:structuredClone(track.inserts||[]),sends:structuredClone(track.sends||[]),clips:(track.clips||[]).map(c=>({id:c.id||null,source_asset_id:c.source_asset_id||null,source_version:Math.max(0,Math.round(finite(c.source_version,0))),start_seconds:finite(c.start_seconds,0),duration_seconds:finite(c.duration_seconds,0),source_offset_seconds:finite(c.source_offset_seconds,0),gain_db:finite(c.gain_db,0),fade_in_seconds:finite(c.fade_in_seconds,0),fade_out_seconds:finite(c.fade_out_seconds,0),muted:c.muted===true,loop_enabled:c.loop_enabled===true,loop_length_seconds:c.loop_enabled===true?finite(c.loop_length_seconds,null):null,reversed:c.reversed===true,warp_mode:text(c.warp_mode||"off")}))};}
function relevantState(session={}){return {tracks:(session.tracks||[]).map(trackControlState),automation_lanes:structuredClone(session.automation_lanes||[])};}
export function createMusicMixEngineerBaseline(session={}){const state=relevantState(session);return {contract:BASELINE_CONTRACT,created_at:new Date().toISOString(),source_revision:Math.max(0,Math.round(finite(session.revision,0))),state,fingerprint:hash(state),immutable:true};}
export function sessionMusicMixFingerprint(session={}){return hash(relevantState(session));}
function sessionFromBaseline(session={},baseline={}){const next=structuredClone(session),baseById=new Map((baseline?.state?.tracks||[]).map(t=>[t.id,t]));for(const track of next.tracks||[]){const b=baseById.get(track.id);if(!b)continue;track.gain_db=b.gain_db;track.pan=b.pan;track.channel_strip=structuredClone(b.channel_strip||{});track.inserts=structuredClone(b.inserts||[]);track.sends=structuredClone(b.sends||[]);}next.automation_lanes=structuredClone(baseline?.state?.automation_lanes||[]);return next;}
function evidenceFingerprint(bundle={}){return hash({contract:bundle?.contract||null,tracks:(bundle?.tracks||[]).map(r=>({track_id:r.track_id,measured:r.measured===true,mean_db:r.mean_db??null,peak_dbfs:r.peak_dbfs??null,crest_proxy_db:r.crest_proxy_db??null,sub_vs_lowmid_db:r.sub_vs_lowmid_db??null,presence_vs_lowmid_db:r.presence_vs_lowmid_db??null,air_vs_presence_db:r.air_vs_presence_db??null,sibilance_vs_presence_db:r.sibilance_vs_presence_db??null,warmth_vs_lowmid_db:r.warmth_vs_lowmid_db??null,boxiness_vs_warmth_db:r.boxiness_vs_warmth_db??null,boxiness_vs_presence_db:r.boxiness_vs_presence_db??null,stereo_correlation:r.stereo_correlation??null,mono_fold_down_loss_db:r.mono_fold_down_loss_db??null,stereo_phase_risk:r.stereo_phase_risk===true,low_stereo_correlation:r.low_stereo_correlation??null,low_mono_fold_down_loss_db:r.low_mono_fold_down_loss_db??null,low_stereo_phase_risk:r.low_stereo_phase_risk===true,integrated_lufs:r.integrated_lufs??null,true_peak_dbtp:r.true_peak_dbtp??null,loudness_range_lu:r.loudness_range_lu??null,intermittent_harshness_risk:r.intermittent_harshness_risk===true,dynamic_harshness:r.dynamic_harshness||null,dynamics_envelope:r.dynamics_envelope||[]})),relationships:bundle?.relationships||[]});}
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
  let pan=finite(track.pan,0), gain=finite(track.gain_db,0), reverb=null, saturation=null, deesser=null;
  const measured=evidence?.measured===true; const crest=finite(evidence?.crest_proxy_db,null); const mean=finite(evidence?.mean_db,null); const subLow=finite(evidence?.sub_vs_lowmid_db,null); const presenceLow=finite(evidence?.presence_vs_lowmid_db,null); const airPresence=finite(evidence?.air_vs_presence_db,null); const sibilancePresence=finite(evidence?.sibilance_vs_presence_db,null); const boxWarm=finite(evidence?.boxiness_vs_warmth_db,null); const boxPresence=finite(evidence?.boxiness_vs_presence_db,null);

  if(measured && ["VOCAL","GUITAR","KEYS","BACKING"].includes(r) && boxWarm!==null && boxPresence!==null && boxWarm>1.5 && boxPresence>-6){
    strip.eq_bands=Array.isArray(strip.eq_bands)?structuredClone(strip.eq_bands):[];
    const id=`mix-eq-boxiness-${track.id}`;
    const existingIndex=strip.eq_bands.findIndex(b=>text(b.id)===id);
    const severity=clamp((boxWarm-1.5)/5,0,1);
    const gain=Number((-(r==="VOCAL"?0.75:0.5)-severity*(r==="VOCAL"?0.75:0.5)).toFixed(2));
    const frequency=r==="VOCAL"?380:(r==="GUITAR"?330:420);
    const band={contract:"AVANTIQO_MUSIC_PARAMETRIC_EQ_V1",id,type:"bell",enabled:true,frequency_hz:frequency,gain_db:gain,q:r==="VOCAL"?0.95:0.85,destructive_processing_allowed:false};
    if(existingIndex>=0) strip.eq_bands[existingIndex]={...strip.eq_bands[existingIndex],...band}; else if(strip.eq_bands.length<12) strip.eq_bands.push(band);
    decisions.push(`measured low-mid boxiness control ${gain} dB at ${frequency} Hz`);
  }
  if(r==="VOCAL"){
    strip.high_pass_hz=Math.max(finite(strip.high_pass_hz,20),75); const presenceLift=measured&&presenceLow>2?0.5:1.5; const airLift=measured&&airPresence>0?0.25:0.75; strip.presence_db=clamp(finite(strip.presence_db,0)+presenceLift,-12,12); strip.high_shelf_db=clamp(finite(strip.high_shelf_db,0)+airLift,-12,12);
    const vocalLowCrest=measured&&crest!==null&&crest<8, vocalHighCrest=measured&&crest!==null&&crest>14; const vocalRatio=vocalLowCrest?2:vocalHighCrest?3.2:3, vocalAttack=vocalLowCrest?28:vocalHighCrest?16:20, vocalMakeup=vocalLowCrest?.5:1; const vocalThreshold=measuredCompressorThreshold(evidence,-20,-30,-10); strip.compressor={...strip.compressor,enabled:true,threshold_db:vocalThreshold,ratio:vocalRatio,attack_ms:vocalAttack,release_ms:110,knee_db:6,makeup_db:vocalMakeup}; if(measured&&mean!==null) decisions.push(`level-calibrated vocal compression threshold ${vocalThreshold} dBFS`); if(vocalLowCrest) decisions.push("preserve measured vocal transient life");
    pan=clamp(pan,-0.08,0.08); reverb={level_db:-17}; saturation={drive_db:2.5,mix:0.12,output_db:0}; if(measured&&sibilancePresence!==null&&sibilancePresence>-2.5){const existingDeesser=(track.inserts||[]).find(x=>x.type==="deesser");const automaticAllowed=!existingDeesser||text(existingDeesser.id).startsWith("mix-deesser-");if(automaticAllowed){const severity=clamp((sibilancePresence+2.5)/4,0,1);deesser={frequency_hz:6800,threshold_db:Number((-22-severity*6).toFixed(1)),ratio:Number((2.5+severity*1.5).toFixed(2)),max_reduction_db:Number((3+severity*3).toFixed(1)),attack_ms:1.5,release_ms:85};decisions.push("evidence-based sibilance control");}else decisions.push("manual de-esser preserved");}
    decisions.push("center vocal image","gentle vocal compression","presence/air lift","short cohesive space");
  } else if(r==="BASS"){
    strip.high_pass_hz=Math.max(25,finite(strip.high_pass_hz,20)); const lowLift=measured&&subLow>3?0:0.75; strip.low_shelf_db=clamp(finite(strip.low_shelf_db,0)+lowLift,-12,12); strip.presence_db=clamp(finite(strip.presence_db,0)-0.5,-12,12);
    const bassLowCrest=measured&&crest!==null&&crest<8, bassHighCrest=measured&&crest!==null&&crest>12; const bassThreshold=measuredCompressorThreshold(evidence,-18,-28,-8); strip.compressor={...strip.compressor,enabled:true,threshold_db:bassThreshold,ratio:bassLowCrest?2.5:3.5,attack_ms:bassLowCrest?34:bassHighCrest?28:30,release_ms:140,knee_db:5,makeup_db:0}; if(measured&&mean!==null) decisions.push(`level-calibrated bass compression threshold ${bassThreshold} dBFS`); if(bassLowCrest) decisions.push("protect measured bass articulation"); pan=0;
    decisions.push("mono-compatible low-end anchor","controlled sustain","preserve attack");
  } else if(r==="DRUMS"){
    strip.high_pass_hz=Math.max(28,finite(strip.high_pass_hz,20)); const drumLowCrest=measured&&crest!==null&&crest<9, drumHighCrest=measured&&crest!==null&&crest>14; const drumThreshold=measuredCompressorThreshold(evidence,-16,-24,-6); strip.compressor={...strip.compressor,enabled:true,threshold_db:drumThreshold,ratio:drumLowCrest?1.8:drumHighCrest?2.4:2.2,attack_ms:drumLowCrest?42:drumHighCrest?30:34,release_ms:drumLowCrest?120:90,knee_db:4,makeup_db:drumLowCrest?0:0.25}; if(measured&&mean!==null) decisions.push(`level-calibrated drum compression threshold ${drumThreshold} dBFS`); if(drumLowCrest) decisions.push("restore measured drum transient space"); saturation={drive_db:2,mix:0.08,output_db:0};
    decisions.push("transient preservation","gentle glue","subtle harmonic density");
  } else if(["GUITAR","KEYS","BACKING"].includes(r)){
    strip.high_pass_hz=Math.max(r==="KEYS"?55:70,finite(strip.high_pass_hz,20)); if(Math.abs(pan)<0.12) pan=r==="GUITAR"?-0.18:0.18; reverb={level_db:-21};
    decisions.push("clear low-mid space","supporting stereo placement","shared depth");
  }
  return {track_id:track.id,track_name:track.name||"Track",role:r,gain_db:gain,pan,channel_strip:strip,reverb_send:reverb,saturation,deesser,decisions,evidence:measured?evidence:null,evidence_measured:measured,changed:decisions.length>0};
}

function relationshipAdjustments(tracks=[], evidenceBundle={}){
  const decisionsById=new Map(tracks.map(row=>[row.track_id,row]));
  const rolesById=new Map(tracks.map(row=>[row.track_id,row.role]));
  const relations=Array.isArray(evidenceBundle?.relationships)?evidenceBundle.relationships:[];
  const notes=[];
  for(const rel of relations){
    const a=decisionsById.get(rel.track_a_id),b=decisionsById.get(rel.track_b_id); if(!a||!b)continue;
    const ra=rolesById.get(rel.track_a_id),rb=rolesById.get(rel.track_b_id);
    const pair=new Set([ra,rb]);
    const temporal=rel.simultaneous_timeline_windows_measured===true&&finite(rel.overlap_window_count,0)>=3;
    const presenceScore=temporal?finite(rel.temporal_presence_competition_score,0):finite(rel.presence_overlap_score,0);
    const lowScore=temporal?finite(rel.temporal_low_competition_score,0):finite(rel.low_overlap_score,0);
    const levelScore=temporal?finite(rel.temporal_level_proximity_score,0):finite(rel.level_proximity_score,0);
    if(pair.has("VOCAL") && presenceScore>=0.68 && levelScore>=0.42){
      const support=ra==="VOCAL"?b:a;
      if(["GUITAR","KEYS","BACKING","OTHER"].includes(support.role)){support.channel_strip.presence_db=clamp(finite(support.channel_strip.presence_db,0)-1,-12,12);support.gain_db=clamp(finite(support.gain_db,0)-0.5,-60,12);support.decisions.push(temporal?"create timeline-measured vocal presence pocket":"create measured vocal presence pocket");notes.push({type:temporal?"VOCAL_TEMPORAL_COMPETITION":"VOCAL_MASKING_PROXY",lead_track_id:ra==="VOCAL"?a.track_id:b.track_id,support_track_id:support.track_id,presence_score:presenceScore,level_score:levelScore,overlap_window_count:temporal?rel.overlap_window_count:null,psychoacoustic_masking_measured:false});}
    }
    if(pair.has("BASS") && pair.has("DRUMS") && lowScore>=0.68 && levelScore>=0.4){
      const bass=ra==="BASS"?a:b,drums=ra==="DRUMS"?a:b; bass.channel_strip.low_shelf_db=clamp(finite(bass.channel_strip.low_shelf_db,0)-0.5,-12,12);drums.channel_strip.high_pass_hz=Math.max(finite(drums.channel_strip.high_pass_hz,28),32);bass.decisions.push(temporal?"reduce timeline-measured bass/kick competition":"reduce bass/kick low-band overlap proxy");drums.decisions.push(temporal?"tighten timeline-measured drum sub competition":"tighten drum sub overlap proxy");notes.push({type:temporal?"LOW_END_TEMPORAL_COMPETITION":"LOW_END_MASKING_PROXY",bass_track_id:bass.track_id,drum_track_id:drums.track_id,low_score:lowScore,level_score:levelScore,overlap_window_count:temporal?rel.overlap_window_count:null,psychoacoustic_masking_measured:false});
    }
  }
  return notes;
}
export function analyzeMusicMixEngineer(session={}, evidenceBundle={}, arrangement={}, baseline=null){
  const sourceSession=baseline?.contract===BASELINE_CONTRACT?sessionFromBaseline(session,baseline):session;
  const evidenceById=new Map((evidenceBundle?.tracks||[]).map(row=>[row.track_id,row]));
  const tracks=(sourceSession.tracks||[]).filter(t=>t.mute!==true).map(track=>trackDecision(track,evidenceById.get(track.id)||{}));
  const relationshipDecisions=relationshipAdjustments(tracks,evidenceBundle);
  const automationPlan=buildMusicMixAutomationPlan(sourceSession,arrangement,evidenceBundle);
  const vocalCount=tracks.filter(t=>t.role==="VOCAL").length, bassCount=tracks.filter(t=>t.role==="BASS").length;
  const issues=[]; if(vocalCount>1) issues.push({code:"MULTIPLE_VOCAL_TRACKS",message:"Multiple vocal tracks detected; lead/background role confirmation is recommended before aggressive vocal balancing."});
  if(finite(evidenceBundle?.blocked_evidence_track_count,evidenceBundle?.ambiguous_source_track_count||0)>0){const count=Math.round(finite(evidenceBundle?.blocked_evidence_track_count,evidenceBundle?.ambiguous_source_track_count||0));issues.push({code:"TRACK_RENDER_REQUIRED_FOR_EVIDENCE",message:`${count} track${count===1?"":"s"} ${count===1?"lacks":"lack"} complete technically valid neutral evidence. Measured mix decisions are withheld until complete evidence is available.`});}
if(finite(evidenceBundle?.incomplete_analysis_range_count,0)>0){const count=Math.round(finite(evidenceBundle.incomplete_analysis_range_count,0));issues.push({code:"TRACK_ANALYSIS_RANGE_INCOMPLETE",message:`${count} track${count===1?" exceeds":"s exceed"} the ${MAX_SAFE_MIX_EVIDENCE_MINUTES}-minute automatic analysis window. Partial diagnostics are retained, but Avantiqo will not use them for whole-track mix decisions.`});}
if(finite(evidenceBundle?.phase_risk_track_count,0)>0){const count=Math.round(finite(evidenceBundle.phase_risk_track_count,0));issues.push({code:"TRACK_STEREO_PHASE_RISK",message:`${count} measured track${count===1?"":"s"} ${count===1?"shows":"show"} stereo phase/mono-compatibility risk. Avantiqo will not auto-narrow or alter polarity without listening and source verification.`});}
if(finite(evidenceBundle?.intermittent_harshness_track_count,0)>0){const count=Math.round(finite(evidenceBundle.intermittent_harshness_track_count,0));issues.push({code:"TRACK_INTERMITTENT_HARSHNESS_RISK",message:`${count} measured track${count===1?"":"s"} ${count===1?"shows":"show"} intermittent upper-mid harshness risk. Avantiqo will not apply dynamic EQ automatically without listening review.`});}
if(finite(evidenceBundle?.low_stereo_phase_risk_track_count,0)>0){const count=Math.round(finite(evidenceBundle.low_stereo_phase_risk_track_count,0));issues.push({code:"TRACK_LOW_STEREO_PHASE_RISK",message:`${count} measured track${count===1?"":"s"} ${count===1?"shows":"show"} low-frequency stereo/mono-compatibility risk. Avantiqo will not force bass mono or alter polarity without listening and source verification.`});}
  if(!bassCount) issues.push({code:"LOW_END_ROLE_UNCLEAR",message:"No explicit bass role detected; low-end authority should be reviewed by listening before release."});
  if((sourceSession.tracks||[]).some(t=>t.solo===true)) issues.push({code:"SOLO_ACTIVE",message:"Solo is active and should be cleared before judging the full mix."});
  for(const row of tracks) row.changed=row.decisions.length>0;
  const planCore={contract:CONTRACT,evidence_contract:evidenceBundle?.contract||null,baseline_fingerprint:baseline?.fingerprint||sessionMusicMixFingerprint(sourceSession),evidence_fingerprint:evidenceFingerprint(evidenceBundle),relationship_decisions:relationshipDecisions,automation_plan:automationPlan,track_decisions:tracks}; const planFingerprint=hash(planCore);
  return {...planCore,plan_fingerprint:planFingerprint,status:tracks.some(t=>t.changed)||automationPlan.status==="AUTOMATION_PLAN_READY"?"MIX_PLAN_READY":"NO_SAFE_AUTOMATIC_CHANGES",measured_track_count:tracks.filter(t=>t.evidence_measured).length,simultaneous_timeline_windows_measured:evidenceBundle?.simultaneous_timeline_windows_measured===true,simultaneous_masking_measured:evidenceBundle?.simultaneous_masking_measured===true,issues,principles:["preserve original sources","retain transient life","create vocal hierarchy","protect low-end mono compatibility","use shared depth instead of wash","avoid loudness as a substitute for mix quality"],automatic_mastering_forbidden:true,artistic_listening_review_required:true,mutation_authorized:false};
}
export function applyMusicMixEngineerPlan(session={},plan={}){
  let next=structuredClone(session); const byId=new Map((plan.track_decisions||[]).map(d=>[d.track_id,d]));
  for(const track of next.tracks||[]){const d=byId.get(track.id); if(!d||!d.changed)continue; track.gain_db=d.gain_db; track.pan=d.pan; track.channel_strip=d.channel_strip;
    if(d.reverb_send){track.sends=Array.isArray(track.sends)?track.sends:[]; const i=track.sends.findIndex(s=>s.bus_id==="bus-reverb"); const send={bus_id:"bus-reverb",enabled:true,level_db:d.reverb_send.level_db,pre_fader:false}; if(i>=0)track.sends[i]={...track.sends[i],...send}; else track.sends.push(send);}
    if(d.saturation){track.inserts=Array.isArray(track.inserts)?track.inserts:[]; const i=track.inserts.findIndex(x=>x.type==="saturation"); const insert={id:i>=0?track.inserts[i].id:`mix-saturation-${track.id}`,type:"saturation",enabled:true,bypass:false,parameters:d.saturation}; if(i>=0)track.inserts[i]={...track.inserts[i],...insert}; else track.inserts.push(insert);}
    if(d.deesser){track.inserts=Array.isArray(track.inserts)?track.inserts:[]; const i=track.inserts.findIndex(x=>x.type==="deesser"); const insert={id:i>=0?track.inserts[i].id:`mix-deesser-${track.id}`,type:"deesser",enabled:true,bypass:false,parameters:d.deesser}; if(i>=0)track.inserts[i]={...track.inserts[i],...insert}; else track.inserts.push(insert);}
    const delayLane=(plan.automation_plan?.lanes||[]).find(l=>l.target_type==="track"&&l.target_id===track.id&&l.parameter==="send_db:bus-delay"&&!l.blocked_by_existing_manual_lane);
    if(delayLane){track.sends=Array.isArray(track.sends)?track.sends:[];const i=track.sends.findIndex(s=>s.bus_id==="bus-delay");const send={bus_id:"bus-delay",enabled:true,level_db:-60,pre_fader:false,owned_by_mix_engineer:true};if(i>=0){if(text(track.sends[i].id).startsWith("mix-")||track.sends[i].owned_by_mix_engineer===true)track.sends[i]={...track.sends[i],...send};}else track.sends.push(send);}
  }
  next=applyMusicMixAutomationPlan(next,plan.automation_plan||{});
  next.revision=Math.max(0,Math.round(finite(session.revision,0)))+1; next.mix_engineer={contract:CONTRACT,applied_at:new Date().toISOString(),artistic_listening_review_required:true,source_revision:Math.max(0,Math.round(finite(session.revision,0)))}; return next;
}
export function createMusicMixEngineerSnapshot(session={},plan={}){return {contract:SNAPSHOT_CONTRACT,id:`music-mix-snapshot-${crypto.randomUUID()}`,created_at:new Date().toISOString(),session:structuredClone(session),plan:structuredClone(plan),immutable:true,reversible:true};}
export function validateMusicMixEngineerSnapshot(s={}){if(s.contract!==SNAPSHOT_CONTRACT||s.immutable!==true||s.reversible!==true||!s.session)throw new Error("CREATIVE_MUSIC_MIX_ENGINEER_SNAPSHOT_INVALID"); return true;}
export const CreativeMusicMixEngineerRuntime=Object.freeze({contract:CONTRACT,baselineContract:BASELINE_CONTRACT,snapshotContract:SNAPSHOT_CONTRACT,analyze:analyzeMusicMixEngineer,apply:applyMusicMixEngineerPlan,snapshot:createMusicMixEngineerSnapshot,validateSnapshot:validateMusicMixEngineerSnapshot,createBaseline:createMusicMixEngineerBaseline,fingerprint:sessionMusicMixFingerprint});
