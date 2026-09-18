import fs from "node:fs/promises";
import crypto from "node:crypto";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { CreativeMaterialLabRuntime } from "@/lib/creative/materials/runtime/CreativeMaterialLabRuntime";

export const AVANTIQO_MATERIAL_TEXTURE_BINDING_CONTRACT="AVANTIQO_MATERIAL_TEXTURE_BINDING_V1";
const CHANNELS=new Set(["BASE_COLOR","ALBEDO","ROUGHNESS","METALLIC","NORMAL","HEIGHT","DISPLACEMENT","EMISSION","ALPHA"]);
function text(v){return String(v??"").trim();}
function safe(v){return text(v).replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"texture";}
function checksum(buffer){return crypto.createHash("sha256").update(buffer).digest("hex");}
export async function bindMaterialTextures({organization_id,creative_project_id,library,sandbox,base_path="/tmp/avantiqo-material-textures",policy={}}={}){
  if(!organization_id||!creative_project_id||library?.contract!==CreativeMaterialLabRuntime.contract||!sandbox)throw new Error("MATERIAL_TEXTURE_BINDING_SCOPE_REQUIRED");
  const materials=[];const cleanups=[];const bindings=[];
  try{
    for(const material of library.materials){const maps=[];for(const map of material.texture_maps||[]){const channel=text(map.channel).toUpperCase();if(!CHANNELS.has(channel))throw new Error(`MATERIAL_TEXTURE_CHANNEL_UNSUPPORTED:${material.material_id}:${channel}`);const node=await AssetGraphRepository.getById(map.asset_node_id);if(!node||text(node.organization_id)!==text(organization_id))throw new Error(`MATERIAL_TEXTURE_ASSET_REQUIRED:${material.material_id}:${map.asset_node_id}`);if(node.creative_project_id&&text(node.creative_project_id)!==text(creative_project_id))throw new Error(`MATERIAL_TEXTURE_PROJECT_MISMATCH:${material.material_id}:${map.asset_node_id}`);if(!node.url)throw new Error(`MATERIAL_TEXTURE_URL_REQUIRED:${map.asset_node_id}`);const media=await materializeMedia({organization_id,url:node.url,file_name:node.name||`${node.id}.bin`,mime_type:node.technical?.mime_type||null,policy});cleanups.push(media);const buffer=await fs.readFile(media.file_path);const sha=checksum(buffer);const ext=(node.name||"").includes(".")?`.${safe(node.name).split('.').pop()}`:".bin";const sandboxPath=`${base_path}/${material.material_id}/${channel.toLowerCase()}-${sha.slice(0,16)}${ext}`;await sandbox.runCommand({cmd:"mkdir",args:["-p",sandboxPath.slice(0,sandboxPath.lastIndexOf('/'))]});await sandbox.writeFiles([{path:sandboxPath,content:buffer}]);const bound={...map,channel,sandbox_path:sandboxPath,checksum:sha,source_asset_node_id:node.id,source_mime_type:node.technical?.mime_type||null};maps.push(bound);bindings.push({material_id:material.material_id,...bound});}materials.push({...material,texture_maps:maps});}
    return{contract:AVANTIQO_MATERIAL_TEXTURE_BINDING_CONTRACT,library:{...library,materials},bindings,binding_count:bindings.length,provenance_complete:true,provider_calls_performed:false,cleanup:async()=>{for(const m of cleanups)await m.cleanup?.().catch?.(()=>{});}};
  }catch(error){for(const m of cleanups)await m.cleanup?.().catch?.(()=>{});throw error;}
}
export const CreativeMaterialTextureBindingRuntime=Object.freeze({contract:AVANTIQO_MATERIAL_TEXTURE_BINDING_CONTRACT,bind:bindMaterialTextures});
