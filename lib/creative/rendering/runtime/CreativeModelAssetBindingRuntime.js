import fs from "node:fs/promises";
import crypto from "node:crypto";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { CreativeAutomotiveAssetInterchangeRuntime } from "@/lib/creative/rendering/runtime/CreativeAutomotiveAssetInterchangeRuntime";

export const AVANTIQO_MODEL_ASSET_BINDING_CONTRACT="AVANTIQO_MODEL_ASSET_BINDING_V1";
const EXTENSIONS=new Set(["glb","gltf","fbx","obj","usd","usda","usdc","abc"]);
function text(v){return String(v??"").trim();}
function safe(v){return text(v).replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"model";}
function checksum(buffer){return crypto.createHash("sha256").update(buffer).digest("hex");}
export async function bindModelAssets({organization_id,creative_project_id,objects=[],sandbox,base_path="/tmp/avantiqo-model-assets",policy={}}={}){
  if(!organization_id||!creative_project_id||!sandbox)throw new Error("MODEL_ASSET_BINDING_SCOPE_REQUIRED");
  const bound=[];const cleanups=[];const bindings=[];
  try{
    for(const object of objects){if(String(object.type||"").toUpperCase()!=="MODEL_ASSET"){bound.push(object);continue;}const assetId=text(object.model_asset_node_id);if(!assetId)throw new Error(`MODEL_ASSET_NODE_REQUIRED:${object.name||object.object_id}`);const node=await AssetGraphRepository.getById(assetId);if(!node||text(node.organization_id)!==text(organization_id))throw new Error(`MODEL_ASSET_NOT_FOUND:${assetId}`);if(node.creative_project_id&&text(node.creative_project_id)!==text(creative_project_id))throw new Error(`MODEL_ASSET_PROJECT_MISMATCH:${assetId}`);if(!node.url)throw new Error(`MODEL_ASSET_URL_REQUIRED:${assetId}`);const media=await materializeMedia({organization_id,url:node.url,file_name:node.name||`${node.id}.bin`,mime_type:node.technical?.mime_type||null,policy});cleanups.push(media);const buffer=await fs.readFile(media.file_path);const sha=checksum(buffer);const guessed=(node.name||media.file_path||"").split(".").pop().toLowerCase();if(!EXTENSIONS.has(guessed))throw new Error(`MODEL_ASSET_FORMAT_UNSUPPORTED:${assetId}:${guessed}`);const sandboxPath=`${base_path}/${sha.slice(0,2)}/${sha}-${safe(node.name||`model.${guessed}`)}`;await sandbox.runCommand({cmd:"mkdir",args:["-p",sandboxPath.slice(0,sandboxPath.lastIndexOf('/'))]});await sandbox.writeFiles([{path:sandboxPath,content:buffer}]);const automotiveInput=object.automotive_interchange||node.metadata?.automotive_interchange||null;let automotiveInterchange=null;if(object.automotive_asset===true||automotiveInput){automotiveInterchange=CreativeAutomotiveAssetInterchangeRuntime.evaluate({...automotiveInput,interchange_format:automotiveInput?.interchange_format||guessed,source_asset_checksum:automotiveInput?.source_asset_checksum||sha});if(automotiveInterchange.status!=="READY")throw new Error(`AUTOMOTIVE_MODEL_ASSET_BLOCKED:${assetId}:${automotiveInterchange.blockers.join(",")}`);}const b={...object,sandbox_path:sandboxPath,model_format:guessed,model_checksum:sha,source_asset_node_id:node.id,automotive_interchange:automotiveInterchange};bound.push(b);bindings.push({object_id:object.object_id,asset_node_id:node.id,sandbox_path:sandboxPath,model_format:guessed,checksum:sha,automotive_interchange_hash:automotiveInterchange?.interchange_hash||null});}
    return{contract:AVANTIQO_MODEL_ASSET_BINDING_CONTRACT,objects:bound,bindings,binding_count:bindings.length,provider_calls_performed:false,cleanup:async()=>{for(const m of cleanups)await m.cleanup?.().catch?.(()=>{});}};
  }catch(error){for(const m of cleanups)await m.cleanup?.().catch?.(()=>{});throw error;}
}
export const CreativeModelAssetBindingRuntime=Object.freeze({contract:AVANTIQO_MODEL_ASSET_BINDING_CONTRACT,supported_formats:Object.freeze([...EXTENSIONS]),bind:bindModelAssets});
