import crypto from "node:crypto";

import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CreativeImageAssetHandoffRuntime,
} from "@/lib/creative/image/runtime/CreativeImageAssetHandoffRuntime";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

export const CREATIVE_IMAGE_FOUNDATION_AUTHORITY_CONTRACT =
  "CREATIVE_IMAGE_FOUNDATION_AUTHORITY_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function stable(v){if(Array.isArray(v))return v.map(stable);if(!v||typeof v!=="object")return v;return Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])]));}
function hash(v){return crypto.createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");}
function stableVisualSeal(node={}){
  return node.metadata?.image_asset_exploration_selection_seal_hash ||
    node.metadata?.localized_repair_review_task_id ||
    node.metadata?.image_asset_review_task_id ||
    null;
}
function fingerprint(node){
  return node?{
    id:node.id,
    checksum:node.technical?.checksum||null,
    stable_visual_seal:stableVisualSeal(node),
    perceptual_qc_sealed:node.metadata?.image_asset_perceptual_qc_sealed===true,
    localized_repair_review_sealed:node.metadata?.localized_repair_review_sealed===true,
  }:null;
}

function assetClass(task={}){
  return text(
    task.input?.requirements?.image_asset_authority?.asset_class ||
    task.input?.requirements?.asset_class ||
    task.metadata?.image_asset_class,
  ).toUpperCase();
}

function continuityGroup(task={}){
  const r=object(task.input?.requirements);
  return text(
    r.image_asset_authority?.continuity_group_id ||
    r.continuity_group_id ||
    r.generation_strategy?.shared_state_group_id ||
    task.scene_id ||
    task.metadata?.scene_id,
  )||null;
}

function actorIdentityKeys(task={}){
  const r=object(task.input?.requirements);
  return [...new Set(
    list(r.actors)
      .map(actor=>typeof actor==="object"&&actor
        ?text(actor.identity_profile_id||actor.profile_id||actor.id)
        :"")
      .filter(Boolean)
  )];
}
function identityKey(task={}){
  const r=object(task.input?.requirements);
  const explicit=text(
    r.subject_identity_key ||
    r.identity_requirements?.profile_id ||
    r.identity_requirements?.identity_profile_id ||
    r.performance_contract?.identity_profile_id ||
    task.metadata?.identity_profile_id,
  )||null;
  if(explicit) return explicit;
  const keys=actorIdentityKeys(task);
  return keys.length===1?keys[0]:null;
}

function threatKey(task={}){
  const r=object(task.input?.requirements);
  const moving=object(r.environmental_continuity_state?.moving_threat_state);
  const pursuit=object(r.pursuit_spatial_choreography);
  return text(
    r.threat_identity_key ||
    moving.identity_key ||
    moving.threat_identity_key ||
    moving.threat_id ||
    moving.vehicle_id ||
    moving.id ||
    pursuit.threat_identity_key ||
    pursuit.threat_id ||
    pursuit.predator_id ||
    task.metadata?.threat_identity_key,
  )||null;
}

function humanExpected(task={}){
  const r=object(task.input?.requirements);
  const source=[
    r.subject,r.action,r.purpose,
    JSON.stringify(r.actors||[]),
  ].map(text).join(" ").toLowerCase();
  return list(r.actors).length>0 ||
    /\b(man|woman|person|human|runner|performer|actor|face|hand|feet)\b/.test(source);
}

function threatExpected(task={}){
  const r=object(task.input?.requirements);
  const source=[
    r.subject,r.action,r.purpose,
    JSON.stringify(r.pursuit_spatial_choreography||{}),
    JSON.stringify(r.environmental_continuity_state?.moving_threat_state||{}),
  ].map(text).join(" ").toLowerCase();
  return /\b(drone|threat|pursu|hunt|predator|search beam|vehicle pursuer)\b/.test(source);
}

function environmentExpected(task={}){
  const r=object(task.input?.requirements);
  return Boolean(
    r.location ||
    Object.keys(object(r.production_design)).length ||
    Object.keys(object(r.environmental_continuity_state)).length
  );
}

function downstreamShotAsset(task={}){
  return [
    "HERO_FRAME",
    "PERFORMANCE_REFERENCE",
    "CONTACT_DETAIL_REFERENCE",
    "TRANSITION_LOOKFRAME",
    "COMPOSITING_SOURCE",
    "STORYBOARD_FRAME",
  ].includes(assetClass(task));
}

export function evaluateImageFoundationAuthority({
  task={},
  asset_nodes=[],
  force=false,
}={}){
  if(force!==true&&!downstreamShotAsset(task)){
    return Object.freeze({
      contract:CREATIVE_IMAGE_FOUNDATION_AUTHORITY_CONTRACT,
      required:false,
      passed:true,
      failures:[],
      source_assets:[],
      zero_provider_calls:true,
    });
  }

  const group=continuityGroup(task);
  const sceneId=task.scene_id||task.metadata?.scene_id||null;
  const idKey=identityKey(task);
  const actorKeys=actorIdentityKeys(task);
  const governedThreatKey=threatKey(task);
  const failures=[];
  if(humanExpected(task)&&!idKey&&actorKeys.length>1){
    failures.push("IMAGE_FOUNDATION_SUBJECT_IDENTITY_REQUIRED");
  }
  const sourceAssets=[];

  if(!group) failures.push("IMAGE_FOUNDATION_CONTINUITY_GROUP_REQUIRED");

  let character=null;
  if(humanExpected(task)&&!(actorKeys.length>1&&!idKey)){
    character=CreativeImageAssetHandoffRuntime.select({
      asset_nodes,
      scene_id:sceneId,
      shot_id:null,
      continuity_group_id:group,
      identity_key:idKey,
      asset_classes:["CHARACTER_SHEET"],
      downstream_role:"VIDEO",
    }).selected;
    if(!character) failures.push("IMAGE_FOUNDATION_CHARACTER_AUTHORITY_REQUIRED");
    else sourceAssets.push({
      url:character.url,
      role:"IMAGE_STUDIO_FOUNDATION_CHARACTER",
      asset_node_id:character.id,
      subject_identity_key:idKey,
    });
  }

  let threat=null;
  if(threatExpected(task)){
    const threatSelection=CreativeImageAssetHandoffRuntime.select({
      asset_nodes,
      scene_id:sceneId,
      shot_id:null,
      continuity_group_id:group,
      threat_identity_key:governedThreatKey,
      asset_classes:["THREAT_DESIGN"],
      downstream_role:"VIDEO",
    });
    threat=threatSelection.selected;
    if(!governedThreatKey&&threatSelection.candidate_count>1){
      failures.push("IMAGE_FOUNDATION_THREAT_IDENTITY_REQUIRED");
      threat=null;
    }
    if(!threat) failures.push("IMAGE_FOUNDATION_THREAT_AUTHORITY_REQUIRED");
    else sourceAssets.push({
      url:threat.url,
      role:"IMAGE_STUDIO_FOUNDATION_THREAT",
      asset_node_id:threat.id,
      threat_identity_key:governedThreatKey,
    });
  }

  let environment=null;
  if(environmentExpected(task)){
    environment=CreativeImageAssetHandoffRuntime.select({
      asset_nodes,
      scene_id:sceneId,
      shot_id:null,
      continuity_group_id:group,
      asset_classes:["ENVIRONMENT_LOOKFRAME"],
      downstream_role:"VIDEO",
    }).selected;
    if(!environment) failures.push("IMAGE_FOUNDATION_ENVIRONMENT_AUTHORITY_REQUIRED");
    else sourceAssets.push({
      url:environment.url,
      role:"IMAGE_STUDIO_FOUNDATION_ENVIRONMENT",
      asset_node_id:environment.id,
    });
  }

  const authorityEvidence={
    continuity_group_id:group,
    subject_identity_key:idKey,
    actor_identity_keys:actorKeys,
    subject_identity_ambiguous:actorKeys.length>1&&!idKey,
    threat_identity_key:governedThreatKey,
    character:fingerprint(character),
    threat:fingerprint(threat),
    environment:fingerprint(environment),
  };
  return Object.freeze({
    contract:CREATIVE_IMAGE_FOUNDATION_AUTHORITY_CONTRACT,
    required:true,
    passed:failures.length===0,
    failures:[...new Set(failures)],
    continuity_group_id:group,
    subject_identity_key:idKey,
    actor_identity_keys:actorKeys,
    subject_identity_ambiguous:actorKeys.length>1&&!idKey,
    threat_identity_key:governedThreatKey,
    character_asset_node_id:character?.id||null,
    threat_asset_node_id:threat?.id||null,
    environment_asset_node_id:environment?.id||null,
    source_assets:sourceAssets,
    foundation_authority_digest:hash({
      contract:CREATIVE_IMAGE_FOUNDATION_AUTHORITY_CONTRACT,
      evidence:authorityEvidence,
    }),
    authority_evidence:authorityEvidence,
    zero_provider_calls:true,
  });
}

export async function bindImageFoundationAuthority(task={}){
  if(!downstreamShotAsset(task)) return task;
  const nodes=await CreativeAssetGraphRuntime.list({
    organization_id:task.organization_id,
    creative_project_id:task.creative_project_id,
  });
  const authority=evaluateImageFoundationAuthority({task,asset_nodes:nodes});
  if(authority.required!==true) return task;
  if(authority.passed!==true){
    throw new Error(
      "IMAGE_STUDIO_FOUNDATION_AUTHORITY_BLOCKED:"+authority.failures.join(","),
    );
  }
  return ProductionTaskRuntime.update(task.id,{
    input:{
      ...object(task.input),
      source_assets:[
        ...list(task.input?.source_assets),
        ...authority.source_assets,
      ],
      reference_images:[
        ...list(task.input?.reference_images),
        ...authority.source_assets.map(item=>({
          url:item.url,
          role:item.role,
          asset_node_id:item.asset_node_id,
        })),
      ],
      requirements:{
        ...object(task.input?.requirements),
        image_foundation_authority:authority,
        image_foundation_authority_digest:
          authority.foundation_authority_digest,
      },
      generation:{
        ...object(task.input?.generation),
        provider_parameters:{
          ...object(task.input?.generation?.provider_parameters),
          image_foundation_authority_bound:true,
          image_foundation_character_asset_node_id:
            authority.character_asset_node_id,
          image_foundation_threat_asset_node_id:
            authority.threat_asset_node_id,
          image_foundation_environment_asset_node_id:
            authority.environment_asset_node_id,
        },
      },
      provider_parameters:{
        ...object(task.input?.provider_parameters),
        image_foundation_authority_bound:true,
        image_foundation_character_asset_node_id:
          authority.character_asset_node_id,
        image_foundation_threat_asset_node_id:
          authority.threat_asset_node_id,
        image_foundation_environment_asset_node_id:
          authority.environment_asset_node_id,
      },
    },
    metadata:{
      ...object(task.metadata),
      image_foundation_authority_contract:authority.contract,
      image_foundation_authority_digest:
        authority.foundation_authority_digest,
      image_foundation_authority_bound:true,
      image_foundation_character_asset_node_id:
        authority.character_asset_node_id,
      image_foundation_threat_asset_node_id:
        authority.threat_asset_node_id,
      image_foundation_environment_asset_node_id:
        authority.environment_asset_node_id,
    },
  });
}

export const CreativeImageFoundationAuthorityRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_FOUNDATION_AUTHORITY_CONTRACT,
  evaluate:evaluateImageFoundationAuthority,
  bind:bindImageFoundationAuthority,
});
