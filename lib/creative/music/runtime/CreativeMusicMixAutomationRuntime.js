import { createMusicAutomationLane } from "./CreativeMusicAutomationRuntime.js";
import { musicBeatToSeconds } from "./CreativeMusicTempoMapRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_MIX_AUTOMATION_DECISION_V2";
const OWNED_PREFIX = "mix-engineer-auto-";
function text(v){return String(v??"").trim();}
function finite(v,f=0){const n=Number(v);return Number.isFinite(n)?n:f;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function role(track={}){const h=`${text(track.type)} ${text(track.name)}`.toLowerCase();if(/vocal|lead|vox|singer/.test(h))return "VOCAL";if(/bass|sub/.test(h))return "BASS";if(/kick|drum|snare|perc/.test(h))return "DRUMS";if(/guitar/.test(h))return "GUITAR";if(/keys|piano|synth|pad/.test(h))return "KEYS";if(/backing|stem|music|instrument/.test(h))return "BACKING";return "OTHER";}
function ownedLane(lane={}){return text(lane.id).startsWith(OWNED_PREFIX);}

function evidenceByTrack(bundle={}){return new Map((bundle.tracks||[]).filter(row=>row?.measured===true).map(row=>[row.track_id,row]));}
function clipAt(track,time){return (track.clips||[]).find(clip=>clip.muted!==true&&time>=finite(clip.start_seconds,0)&&time<=finite(clip.start_seconds,0)+finite(clip.duration_seconds,0));}
function sourceEnvelopeDb(track,evidence,time){const clip=clipAt(track,time);if(!clip||!Array.isArray(evidence?.dynamics_envelope))return null;const sourceTime=finite(clip.source_offset_seconds,0)+(time-finite(clip.start_seconds,0));let best=null,distance=Infinity;for(const row of evidence.dynamics_envelope){const d=Math.abs(finite(row.time_seconds,-999)-sourceTime);if(d<distance){distance=d;best=row;}}return best&&distance<=.8?finite(best.rms_dbfs,null):null;}
function percentile(values,ratio=.5){const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;return v[Math.max(0,Math.min(v.length-1,Math.round((v.length-1)*ratio)))];}
function vocalMicroRide(track,session,evidenceBundle){const evidence=evidenceByTrack(evidenceBundle),vocalEvidence=evidence.get(track.id);if(!vocalEvidence)return {points:[],measured:false};const supports=(session.tracks||[]).filter(t=>t.id!==track.id&&t.mute!==true&&["GUITAR","KEYS","BACKING","OTHER","DRUMS","BASS"].includes(role(t))&&evidence.has(t.id));const times=(vocalEvidence.dynamics_envelope||[]).map(row=>{const clip=(track.clips||[]).find(c=>c.muted!==true);return clip?finite(clip.start_seconds,0)+(finite(row.time_seconds,0)-finite(clip.source_offset_seconds,0)):finite(row.time_seconds,0);}).filter(t=>t>=0);const observations=[];for(const time of times){const vocal=sourceEnvelopeDb(track,vocalEvidence,time);if(!Number.isFinite(vocal)||vocal<-52)continue;const supportLevels=supports.map(t=>{const db=sourceEnvelopeDb(t,evidence.get(t.id),time);return Number.isFinite(db)?db+finite(t.gain_db,0):null;}).filter(Number.isFinite);if(!supportLevels.length)continue;const support=10*Math.log10(supportLevels.reduce((sum,db)=>sum+10**(db/10),0));observations.push({time,vocal:vocal+finite(track.gain_db,0),support,relative:(vocal+finite(track.gain_db,0))-support});}
  const center=percentile(observations.map(row=>row.relative),.5);if(!Number.isFinite(center)||observations.length<6)return {points:[],measured:false,observation_count:observations.length};const points=[];let previous=0;for(const row of observations){const deviation=row.relative-center;let correction=0;if(Math.abs(deviation)>=1.5)correction=clamp(-deviation*.35,-.9,.9);correction=previous*.35+correction*.65;previous=correction;if(Math.abs(correction)<.15)correction=0;points.push({time_seconds:Number(row.time.toFixed(3)),delta_db:Number(correction.toFixed(2)),relative_db:Number(row.relative.toFixed(2))});}return {points,measured:true,observation_count:observations.length,reference_relative_db:Number(center.toFixed(2)),max_correction_db:.9,method:"VOCAL_TO_ACTIVE_ACCOMPANIMENT_ENVELOPE"};}
function sectionValueAt(track,sections,tempoMap,roleId,time){let current=sections[0];for(const section of sections){const start=musicBeatToSeconds(tempoMap,section.start_beat);if(start<=time)current=section;else break;}return clamp(finite(track.gain_db,0)+deltaFor(roleId,current),-60,12);}
function mergeVocalMicro(points,track,sections,tempoMap,micro){if(!micro?.measured||!(micro.points||[]).length)return points;const byTime=new Map(points.map(p=>[Number(p.time_seconds.toFixed(3)),p]));for(const row of micro.points){const t=Number(row.time_seconds.toFixed(3)),base=sectionValueAt(track,sections,tempoMap,"VOCAL",t),baseline=finite(track.gain_db,0),combined=clamp(base+row.delta_db,baseline-1.2,baseline+1.2);byTime.set(t,{time_seconds:t,value:Number(clamp(combined,-60,12).toFixed(2)),micro_ride_delta_db:row.delta_db,relative_to_accompaniment_db:row.relative_db});}return [...byTime.values()].sort((a,b)=>a.time_seconds-b.time_seconds).slice(0,2048);}


function sendLevel(track,busId,fallback){const send=(track.sends||[]).find(row=>row.bus_id===busId);return finite(send?.level_db,fallback);}
function reverbDelta(roleId,section={}){const intensity=clamp(finite(section.intensity,.5),0,1),type=text(section.type).toLowerCase();if(roleId==="VOCAL"){let d=(intensity-.5)*1.2;if(type==="chorus")d+=.45;if(type==="intro"||type==="outro")d+=.2;return clamp(d,-.7,1.2);}if(["GUITAR","KEYS","BACKING"].includes(roleId)){let d=(intensity-.5)*.7;if(type==="chorus")d+=.2;return clamp(d,-.45,.7);}return 0;}
function sendPoints(track,sections,tempoMap,roleId,busId,base,factor){const points=[];for(let i=0;i<sections.length;i+=1){const s=sections[i],start=musicBeatToSeconds(tempoMap,s.start_beat),end=musicBeatToSeconds(tempoMap,s.end_beat),value=clamp(base+factor(roleId,s),-60,6),prev=points.at(-1);if(i===0)points.push({time_seconds:Number(start.toFixed(3)),value:Number(value.toFixed(2))});else{const ramp=.22,pre=Math.max(0,start-ramp),post=Math.min(end,start+ramp);if(prev&&pre>prev.time_seconds+.01)points.push({time_seconds:Number(pre.toFixed(3)),value:prev.value});points.push({time_seconds:Number(post.toFixed(3)),value:Number(value.toFixed(2))});}if(i===sections.length-1&&end>start)points.push({time_seconds:Number(end.toFixed(3)),value:Number(value.toFixed(2))});}return points;}
function vocalActiveNear(track,evidence,time){const db=sourceEnvelopeDb(track,evidence,time);return Number.isFinite(db)&&db>-44;}
function delayThrowPoints(track,sections,tempoMap,evidence){const base=sendLevel(track,"bus-delay",-60),points=[{time_seconds:0,value:base}],throws=[];for(const s of sections){const type=text(s.type).toLowerCase();if(!["pre_chorus","chorus","bridge"].includes(type))continue;const end=musicBeatToSeconds(tempoMap,s.end_beat),probe=Math.max(0,end-.18);if(!vocalActiveNear(track,evidence,probe))continue;const up=Math.max(-18,Math.min(-13,base+42));points.push({time_seconds:Number(Math.max(0,end-.2).toFixed(3)),value:base},{time_seconds:Number(Math.max(0,end-.08).toFixed(3)),value:Number(up.toFixed(2))},{time_seconds:Number((end+.16).toFixed(3)),value:base});throws.push({section_id:s.id||null,section_type:type,time_seconds:Number(end.toFixed(3)),throw_db:Number(up.toFixed(2))});}return {points:points.sort((a,b)=>a.time_seconds-b.time_seconds).slice(0,2048),throws,measured:throws.length>0};}

function deltaFor(roleId, section={}){const intensity=clamp(finite(section.intensity,.5),0,1);const type=text(section.type).toLowerCase();if(roleId==="VOCAL"){let d=(intensity-.55)*1.3;if(type==="chorus")d+=.2;if(type==="intro"||type==="outro")d-=.15;return clamp(d,-.5,.8);}if(["GUITAR","KEYS","BACKING"].includes(roleId)){const vocalFocus=(type==="chorus"||type==="pre_chorus")?1:0;return clamp(-(intensity-.55)*.35-vocalFocus*.12,-.4,.2);}return 0;}
function pointsFor(track, sections, tempoMap, roleId){const base=finite(track.gain_db,0), points=[];for(let i=0;i<sections.length;i+=1){const s=sections[i],start=musicBeatToSeconds(tempoMap,s.start_beat),end=musicBeatToSeconds(tempoMap,s.end_beat),value=clamp(base+deltaFor(roleId,s),-60,12),prev=points.at(-1);if(i===0){points.push({time_seconds:Number(start.toFixed(3)),value:Number(value.toFixed(2))});}else{const ramp=.18,pre=Math.max(0,start-ramp),post=Math.min(end,start+ramp);if(prev&&pre>prev.time_seconds+.01)points.push({time_seconds:Number(pre.toFixed(3)),value:prev.value});points.push({time_seconds:Number(post.toFixed(3)),value:Number(value.toFixed(2))});}if(i===sections.length-1&&end>start)points.push({time_seconds:Number(end.toFixed(3)),value:Number(value.toFixed(2))});}return points.filter((p,i,a)=>!i||p.time_seconds>a[i-1].time_seconds+.001||p.value!==a[i-1].value);}
export function buildMusicMixAutomationPlan(session={}, arrangement={}, evidenceBundle={}) {
  const sections=(arrangement.sections||[])
    .filter(s=>Number.isFinite(Number(s.start_beat))&&Number.isFinite(Number(s.end_beat)))
    .sort((a,b)=>a.start_beat-b.start_beat);
  if(sections.length<2) return {contract:CONTRACT,status:"ARRANGEMENT_REQUIRED",lanes:[],section_count:sections.length,artistic_intent_inferred:false,mutation_authorized:false};
  const tempoMap=session.tempo_map||{initial_bpm:session.bpm||120,initial_time_signature:session.time_signature||"4/4"};
  const lanes=[];
  const evidence=evidenceByTrack(evidenceBundle);
  for(const track of session.tracks||[]) {
    if(track.mute===true) continue;
    const r=role(track);
    if(!["VOCAL","GUITAR","KEYS","BACKING"].includes(r)) continue;
    const manual=(parameter)=>(session.automation_lanes||[]).find(l=>l.target_type==="track"&&l.target_id===track.id&&l.parameter===parameter);
    const existing=manual("gain_db");
    const blocked=Boolean(existing&&!ownedLane(existing));
    let points=pointsFor(track,sections,tempoMap,r);
    const micro=r==="VOCAL"?vocalMicroRide(track,session,evidenceBundle):null;
    if(r==="VOCAL") points=mergeVocalMicro(points,track,sections,tempoMap,micro);
    if(points.length>=2) lanes.push({id:existing&&ownedLane(existing)?existing.id:`${OWNED_PREFIX}${track.id}`,target_type:"track",target_id:track.id,track_name:track.name||"Track",role:r,parameter:"gain_db",interpolation:"linear",points,blocked_by_existing_manual_lane:blocked,decision:r==="VOCAL"&&micro?.measured?"measured vocal ride + section movement":r==="VOCAL"?"section-aware vocal ride":"section-aware supporting energy ride",max_delta_db:r==="VOCAL"?1.2:.4,micro_dynamics:micro});

    const reverbParam="send_db:bus-reverb";
    const existingReverb=manual(reverbParam);
    const reverbBlocked=Boolean(existingReverb&&!ownedLane(existingReverb));
    const reverbBase=sendLevel(track,"bus-reverb",r==="VOCAL"?-17:-21);
    const reverbPoints=sendPoints(track,sections,tempoMap,r,"bus-reverb",reverbBase,reverbDelta);
    if(reverbPoints.length>=2) lanes.push({id:existingReverb&&ownedLane(existingReverb)?existingReverb.id:`${OWNED_PREFIX}reverb-${track.id}`,target_type:"track",target_id:track.id,track_name:track.name||"Track",role:r,parameter:reverbParam,interpolation:"linear",points:reverbPoints,blocked_by_existing_manual_lane:reverbBlocked,decision:"subtle section-aware depth movement",max_delta_db:r==="VOCAL"?1.2:.7,spatial_automation:true});

    if(r==="VOCAL") {
      const delay=delayThrowPoints(track,sections,tempoMap,evidence.get(track.id));
      if(delay.measured) {
        const delayParam="send_db:bus-delay";
        const existingDelay=manual(delayParam);
        const delayBlocked=Boolean(existingDelay&&!ownedLane(existingDelay));
        lanes.push({id:existingDelay&&ownedLane(existingDelay)?existingDelay.id:`${OWNED_PREFIX}delay-${track.id}`,target_type:"track",target_id:track.id,track_name:track.name||"Track",role:r,parameter:delayParam,interpolation:"linear",points:delay.points,blocked_by_existing_manual_lane:delayBlocked,decision:"measured transition delay throws",spatial_automation:true,measured_transition_activity:true,delay_throws:delay.throws});
      }
    }
  }
  return {contract:"AVANTIQO_MUSIC_MIX_AUTOMATION_DECISION_V3",status:lanes.some(l=>!l.blocked_by_existing_manual_lane)?"AUTOMATION_PLAN_READY":"NO_SAFE_AUTOMATION_CHANGES",section_count:sections.length,lanes,arrangement_intent_source:"PERSISTED_SECTION_INTENSITY",artistic_intent_inferred:false,manual_automation_preserved:true,spatial_automation_renderable:true,delay_throws_require_measured_vocal_activity:true,mutation_authorized:false};
}
export function applyMusicMixAutomationPlan(session={},plan={}){const next=structuredClone(session);next.automation_lanes=Array.isArray(next.automation_lanes)?next.automation_lanes:[];for(const row of plan.lanes||[]){if(row.blocked_by_existing_manual_lane)continue;const lane=createMusicAutomationLane({id:row.id,target_type:row.target_type,target_id:row.target_id,parameter:row.parameter,interpolation:row.interpolation,enabled:true,points:row.points});const i=next.automation_lanes.findIndex(x=>x.id===lane.id);if(i>=0)next.automation_lanes[i]=lane;else next.automation_lanes.push(lane);}return next;}
export const CreativeMusicMixAutomationRuntime=Object.freeze({contract:CONTRACT,build:buildMusicMixAutomationPlan,apply:applyMusicMixAutomationPlan});
