import crypto from "node:crypto";
import { createCreativeAssetNode, CREATIVE_ASSET_NODE_STATUS, CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

export const CREATIVE_DIRECTED_EDIT_TIMELINE_CONTRACT="CREATIVE_DIRECTED_EDIT_TIMELINE_V1";
function text(v){return String(v??"").trim();}
function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function requirement(shot={}){return{shot_id:shot.id,scene_id:shot.scene_id||null,subject:shot.subject||shot.description||shot.purpose||"",action:shot.action||shot.intent?.action||"",purpose:shot.purpose||shot.intent?.purpose||"",emotion:shot.emotion||shot.intent?.emotion||"",mood:shot.mood||shot.intent?.mood||"",location:shot.location||shot.intent?.location||"",actors:list(shot.actors||shot.intent?.actors),products:list(shot.products||shot.intent?.products),dialogue:shot.dialogue||"",narration:shot.narration||"",brand_rules:shot.brand_rules||shot.intent?.brand_rules||{},tags:list(shot.tags||shot.metadata?.tags),transition_in:shot.transition_in||null,transition_out:shot.transition_out||null};}

export async function buildDirectedEditTimeline({organization_id,creative_project_id,shots=[],asset_nodes=[]}={}){
  if(!organization_id||!creative_project_id)throw new Error("DIRECTED_EDIT_TIMELINE_SCOPE_REQUIRED");
  const ordered=list(shots);
  if(!ordered.length)throw new Error("DIRECTED_EDIT_TIMELINE_SHOTS_REQUIRED");
  const entries=[];let cursor=0;
  const identityRows=[];
  for(let index=0;index<ordered.length;index+=1){
    const shot=ordered[index];
    if(shot.metadata?.shot_release_ready_for_edit!==true)throw new Error(`DIRECTED_EDIT_SHOT_NOT_RELEASED:${shot.id}`);
    const assetId=text(shot.metadata?.final_shot_asset_node_id);const asset=asset_nodes.find(n=>text(n.id)===assetId);
    if(!asset||asset.metadata?.final_edit_source!==true||asset.metadata?.include_in_master!==true)throw new Error(`DIRECTED_EDIT_FINAL_SOURCE_REQUIRED:${shot.id}`);
    const duration=finite(asset.technical?.duration_seconds,null);if(!duration||duration<=0)throw new Error(`DIRECTED_EDIT_SOURCE_DURATION_REQUIRED:${shot.id}`);
    const authoredIn=Math.max(0,finite(shot.metadata?.edit_source_in_seconds??shot.edit_source_in_seconds,0));
    const authoredOut=finite(shot.metadata?.edit_source_out_seconds??shot.edit_source_out_seconds,duration);
    const sourceOut=Math.min(duration,authoredOut);if(sourceOut<=authoredIn)throw new Error(`DIRECTED_EDIT_TRIM_INVALID:${shot.id}`);
    const clipDuration=sourceOut-authoredIn;
    entries.push({index:index+1,requirement_index:index,source_asset_node_id:asset.id,source_clip_node_id:null,source_moment_node_id:null,source_url:asset.url,source_in_seconds:authoredIn,source_out_seconds:sourceOut,timeline_in_seconds:cursor,timeline_out_seconds:cursor+clipDuration,duration_seconds:clipDuration,selection_score:null,performance_verified:true,reframe_plan:null,original_source_range:{start_seconds:0,end_seconds:duration},selection_evidence:{authority:"DIRECTOR_LOCKED_RELEASED_SHOT",shot_release_contract:shot.metadata?.shot_release_contract||null,source_checksum:asset.technical?.checksum||null},transition_in:shot.transition_in||null,transition_out:shot.transition_out||null});
    identityRows.push({shot_id:shot.id,scene_id:shot.scene_id||null,asset_node_id:asset.id,checksum:asset.technical?.checksum||null,source_in_seconds:authoredIn,source_out_seconds:sourceOut,transition_in:shot.transition_in||null,transition_out:shot.transition_out||null});
    cursor+=clipDuration;
  }
  const requirements=ordered.map(requirement);const timelineIdentity=hash({contract:CREATIVE_DIRECTED_EDIT_TIMELINE_CONTRACT,creative_project_id,shots:identityRows});
  const existing=asset_nodes.find(n=>n.type===CREATIVE_ASSET_NODE_TYPES.TIMELINE&&text(n.metadata?.directed_edit_timeline_contract)===CREATIVE_DIRECTED_EDIT_TIMELINE_CONTRACT&&text(n.metadata?.timeline_identity)===timelineIdentity&&n.status!==CREATIVE_ASSET_NODE_STATUS.ARCHIVED);
  if(existing)return{timeline:existing,reused:true};
  const node=createCreativeAssetNode({organization_id,creative_project_id,type:CREATIVE_ASSET_NODE_TYPES.TIMELINE,status:CREATIVE_ASSET_NODE_STATUS.DERIVED,name:"Director-locked edit timeline",description:"Deterministic edit timeline assembled only from released optical shot masters in canonical scene/shot order.",lineage:{source:"director_locked_released_shots",provider_id:null,capability:"creative.timeline.directed-assemble",generation_version:1},technical:{mime_type:"application/vnd.avantiqo.edl+json",duration_seconds:cursor},intelligence:{quality_score:null,brand_match_score:null,reuse_score:null,safety_status:"UNKNOWN",tags:["director-locked","final-edit-sources"]},reuse:{reusable:false,approved_for_reuse:false},review:{ai_reviewed:true,human_reviewed:false,approved:false},metadata:{timeline_identity:timelineIdentity,format:"AVANTIQO_EDL_V1",directed_edit_timeline_contract:CREATIVE_DIRECTED_EDIT_TIMELINE_CONTRACT,edit_decision_list:entries,requirements,missing_requirements:[],total_duration_seconds:cursor,clip_count:entries.length,distinct_source_count:entries.length,directed_shot_order_locked:true,semantic_reselection_forbidden:true,fallback_source_selection_forbidden:true,final_edit_sources_only:true,human_picture_lock_required:true,final_color_di_forbidden_before_picture_lock:true,created_at:new Date().toISOString()}});
  return{timeline:await AssetGraphRepository.create(node),reused:false};
}
export const CreativeDirectedEditTimelineRuntime=Object.freeze({contract:CREATIVE_DIRECTED_EDIT_TIMELINE_CONTRACT,build:buildDirectedEditTimeline});
