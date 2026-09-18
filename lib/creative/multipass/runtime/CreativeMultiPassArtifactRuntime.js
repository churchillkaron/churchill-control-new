import crypto from "node:crypto";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { creativeStorageUri } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

export const CREATIVE_MULTIPASS_ARTIFACT_CONTRACT = "CREATIVE_MULTIPASS_ARTIFACT_V1";
const supabase = getServiceSupabase();

function text(v){return String(v??"").trim();}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{ };}
function safe(v,f="artifact"){return text(v||f).normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^\p{L}\p{N}._-]+/gu,"-").replace(/-+/g,"-").replace(/^-|-$/g,"")||f;}
function sha(buffer){return crypto.createHash("sha256").update(buffer).digest("hex");}
function digest(v){return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");}
function typeFor(mime){return text(mime).startsWith("video/")?CREATIVE_ASSET_NODE_TYPES.VIDEO:text(mime).startsWith("image/")?CREATIVE_ASSET_NODE_TYPES.IMAGE:CREATIVE_ASSET_NODE_TYPES.ASSET;}

export async function persistMultiPassArtifact({
  organization_id,creative_project_id,creative_mission_id=null,shot_id,pass_id,artifact_kind,
  buffer,mime_type,extension,provider_id=null,capability=null,upstream_asset_node_ids=[],technical={},metadata={},cost={}
}={}){
  if(!organization_id) throw new Error("organization_id required");
  if(!creative_project_id) throw new Error("creative_project_id required");
  if(!text(shot_id)||!text(pass_id)||!text(artifact_kind)) throw new Error("MULTIPASS_ARTIFACT_IDENTITY_REQUIRED");
  if(!Buffer.isBuffer(buffer)||!buffer.length) throw new Error("MULTIPASS_ARTIFACT_BUFFER_REQUIRED");
  const checksum=sha(buffer);
  const identity=digest({organization_id,creative_project_id,shot_id,pass_id,artifact_kind,checksum});
  const bucket=text(process.env.CREATIVE_MULTIPASS_BUCKET||process.env.CREATIVE_MEDIA_RENDER_BUCKET||process.env.CREATIVE_STILL_RENDER_BUCKET);
  if(!bucket) throw new Error("CREATIVE_MULTIPASS_STORAGE_BUCKET_REQUIRED");
  const storagePath=[safe(organization_id),safe(creative_project_id),"multipass",safe(shot_id),safe(pass_id),`${safe(artifact_kind)}-${identity.slice(0,20)}.${safe(extension)}`].join("/");
  const {error}=await supabase.storage.from(bucket).upload(storagePath,buffer,{contentType:mime_type,upsert:false});
  if(error&&Number(error.statusCode||error.status)!==409) throw error;
  const node=createCreativeAssetNode({
    organization_id,creative_project_id,type:typeFor(mime_type),status:CREATIVE_ASSET_NODE_STATUS.DERIVED,
    name:`${artifact_kind} · ${shot_id}`,description:`Governed ${pass_id} multi-pass artifact for ${shot_id}.`,
    url:creativeStorageUri(bucket,storagePath),storage_path:storagePath,
    lineage:{source:"multipass_production",provider_id,capability,generation_version:1},
    technical:{...object(technical),mime_type,checksum,file_size_bytes:buffer.length},
    cost:{currency:cost.currency||null,estimated:Number(cost.estimated||0),actual:Number(cost.actual||0),saved_by_reuse:0},
    reuse:{reusable:false,reuse_count:0,approved_for_reuse:false},
    review:{ai_reviewed:false,human_reviewed:false,approved:false,notes:"Pass artifact requires its dedicated QC seal before compositing/release."},
    metadata:{...object(metadata),contract:CREATIVE_MULTIPASS_ARTIFACT_CONTRACT,multipass_artifact_identity:identity,creative_mission_id,shot_id,pass_id,artifact_kind:text(artifact_kind).toUpperCase(),upstream_asset_node_ids,checksum_sha256:checksum,simulation_qc_sealed:false,vfx_qc_sealed:false,release_approved:false},
  });
  const persisted=await AssetGraphRepository.createOrFindByMetadataIdentity({node,metadata_key:"multipass_artifact_identity",metadata_value:identity});
  return {contract:CREATIVE_MULTIPASS_ARTIFACT_CONTRACT,created:persisted.created,node:persisted.node,storage_reference:creativeStorageUri(bucket,storagePath),checksum_sha256:checksum,artifact_identity:identity};
}

export async function sealSimulationArtifact({asset_node_id,simulation_qc_seal_hash,simulation_contract_hash=null}={}){
  if(!text(asset_node_id)) throw new Error("SIMULATION_ARTIFACT_NODE_REQUIRED");
  if(!/^[a-f0-9]{64}$/i.test(text(simulation_qc_seal_hash))) throw new Error("SIMULATION_QC_SEAL_HASH_REQUIRED");
  const node=await AssetGraphRepository.getById(asset_node_id);
  if(!node) throw new Error("SIMULATION_ARTIFACT_NODE_NOT_FOUND");
  if(text(node.metadata?.pass_id)!=="simulation") throw new Error("SIMULATION_ARTIFACT_PASS_MISMATCH");
  return AssetGraphRepository.update(asset_node_id,{
    status:"APPROVED",
    review:{...object(node.review),ai_reviewed:true,approved:true,notes:`Physics QC sealed: ${simulation_qc_seal_hash}.`},
    metadata:{...object(node.metadata),simulation_qc_sealed:true,simulation_qc_seal_contract:"AVANTIQO_SIMULATION_QC_SEAL_V1",simulation_qc_seal_hash,simulation_contract_hash,release_approved:true},
  });
}


export async function sealVfxArtifact({asset_node_id,vfx_qc_seal_hash,vfx_contract_hash=null}={}){
  if(!text(asset_node_id)) throw new Error("VFX_ARTIFACT_NODE_REQUIRED");
  if(!/^[a-f0-9]{64}$/i.test(text(vfx_qc_seal_hash))) throw new Error("VFX_QC_SEAL_HASH_REQUIRED");
  const node=await AssetGraphRepository.getById(asset_node_id);
  if(!node) throw new Error("VFX_ARTIFACT_NODE_NOT_FOUND");
  if(!["vfx-integration","lighting-interaction","reflection-shadow"].includes(text(node.metadata?.pass_id))) throw new Error("VFX_ARTIFACT_PASS_MISMATCH");
  return AssetGraphRepository.update(asset_node_id,{
    status:"APPROVED",
    review:{...object(node.review),ai_reviewed:true,approved:true,notes:`VFX QC sealed: ${vfx_qc_seal_hash}.`},
    metadata:{...object(node.metadata),vfx_qc_sealed:true,vfx_qc_seal_contract:"AVANTIQO_VFX_QC_SEAL_V1",vfx_qc_seal_hash,vfx_contract_hash,release_approved:true},
  });
}
export const CreativeMultiPassArtifactRuntime=Object.freeze({contract:CREATIVE_MULTIPASS_ARTIFACT_CONTRACT,persist:persistMultiPassArtifact,sealSimulation:sealSimulationArtifact,sealVfx:sealVfxArtifact});
