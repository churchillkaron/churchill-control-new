import crypto from "node:crypto";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { createCreativeAssetNode, CREATIVE_ASSET_NODE_STATUS, CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";

export const CREATIVE_IMAGE_ASSET_DERIVATIVE_ARTIFACT_CONTRACT = "CREATIVE_IMAGE_ASSET_DERIVATIVE_ARTIFACT_V1";
const supabase=getServiceSupabase();

function text(v){return String(v??"").trim();}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function safe(v,f="artifact"){return text(v||f).normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^\p{L}\p{N}._-]+/gu,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")||f;}
function checksum(buffer){return crypto.createHash("sha256").update(buffer).digest("hex");}
function digest(value){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");}

export async function persistImageAssetDerivative({
  organization_id,creative_project_id,creative_mission_id=null,parent_asset_node_id,
  continuity_group_id=null,derivative_type,buffer,mime_type="image/png",extension="png",
  capability=null,provider_id=null,technical={},metadata={}
}={}){
  if(!organization_id||!creative_project_id) throw new Error("IMAGE_DERIVATIVE_SCOPE_REQUIRED");
  if(!text(parent_asset_node_id)) throw new Error("IMAGE_DERIVATIVE_PARENT_REQUIRED");
  if(!text(derivative_type)) throw new Error("IMAGE_DERIVATIVE_TYPE_REQUIRED");
  if(!Buffer.isBuffer(buffer)||!buffer.length) throw new Error("IMAGE_DERIVATIVE_BUFFER_REQUIRED");
  const sha256=checksum(buffer);
  const identity=digest({organization_id,creative_project_id,parent_asset_node_id,derivative_type:text(derivative_type).toUpperCase(),sha256});
  const bucket=text(process.env.CREATIVE_STILL_RENDER_BUCKET||process.env.CREATIVE_MEDIA_RENDER_BUCKET||process.env.CREATIVE_RECONSTRUCTION_BUCKET);
  if(!bucket) throw new Error("IMAGE_DERIVATIVE_STORAGE_BUCKET_REQUIRED");
  const storagePath=[
    safe(organization_id),safe(creative_project_id),"image-derivatives",safe(parent_asset_node_id),
    `${safe(derivative_type)}-${identity.slice(0,20)}.${safe(extension)}`
  ].join("/");
  const {error}=await supabase.storage.from(bucket).upload(storagePath,buffer,{contentType:mime_type,upsert:false});
  if(error&&Number(error.statusCode||error.status)!==409) throw error;
  const uri=creativeStorageUri(bucket,storagePath);
  const node=createCreativeAssetNode({
    organization_id,creative_project_id,type:CREATIVE_ASSET_NODE_TYPES.IMAGE,status:CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name:`${derivative_type} · ${parent_asset_node_id}`,
    description:`Governed Image Studio derivative ${derivative_type}.`,
    url:uri,storage_path:storagePath,
    lineage:{source:"image_studio_derivative",provider_id,capability,generation_version:1},
    technical:{...object(technical),mime_type,checksum:sha256,file_size_bytes:buffer.length},
    intelligence:{safety_status:"NOT_APPLICABLE",tags:["image-studio-derivative",text(derivative_type).toLowerCase()]},
    cost:{currency:null,estimated:0,actual:0,saved_by_reuse:0},
    reuse:{reusable:true,reuse_count:0,approved_for_reuse:false},
    review:{ai_reviewed:false,human_reviewed:false,approved:false,notes:"Derivative requires derivative QC before downstream use."},
    metadata:{
      ...object(metadata),contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_ARTIFACT_CONTRACT,
      image_asset_derivative_identity:identity,parent_image_asset_node_id:parent_asset_node_id,
      continuity_group_id:text(continuity_group_id)||null,derivative_type:text(derivative_type).toUpperCase(),
      creative_mission_id,checksum_sha256:sha256,durable_evidence:true,
      image_asset_derivative_qc_sealed:false,release_approved:false,
    }
  });
  const persisted=await AssetGraphRepository.createOrFindByMetadataIdentity({
    node,metadata_key:"image_asset_derivative_identity",metadata_value:identity
  });
  return {contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_ARTIFACT_CONTRACT,created:persisted.created,node:persisted.node,storage_reference:uri,checksum_sha256:sha256};
}

export const CreativeImageAssetDerivativeArtifactRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_ASSET_DERIVATIVE_ARTIFACT_CONTRACT,persist:persistImageAssetDerivative
});
