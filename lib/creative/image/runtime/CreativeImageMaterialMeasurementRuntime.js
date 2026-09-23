import { ProductionTaskRuntime } from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { signCreativeStorageReference } from "@/lib/creative/assets/storage/CreativePrivateStorageRuntime";
import { isMaterialTruthSourceCurrent } from "@/lib/creative/image/runtime/CreativeImageMaterialTruthPackRuntime";

export const CREATIVE_IMAGE_MATERIAL_MEASUREMENT_CONTRACT = "CREATIVE_IMAGE_MATERIAL_MEASUREMENT_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function object(v){return v&&typeof v==="object"&&!Array.isArray(v)?v:{};}
function text(v){return String(v??"").trim();}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function parse(value){
  if(!value)return null;
  if(typeof value==="object"&&!Array.isArray(value)){
    for(const c of [value.material_measurement,value.result,value.output,value]){
      if(c&&typeof c==="object"&&!Array.isArray(c)&&("confidence" in c||"roughness" in c||"material_class" in c)) return c;
      if(typeof c==="string"){const p=parse(c);if(p)return p;}
    }
    return null;
  }
  const s=text(value),a=s.indexOf("{"),b=s.lastIndexOf("}");
  if(a<0||b<=a)return null;
  try{return JSON.parse(s.slice(a,b+1));}catch{return null;}
}
function eligible(node={}){
  return node.status==="APPROVED" &&
    node.review?.approved===true &&
    text(node.metadata?.image_asset_class)==="MATERIAL_DETAIL_REFERENCE" &&
    node.metadata?.material_truth_pack_qc_sealed===true &&
    node.metadata?.material_measurement_sealed!==true &&
    node.metadata?.localized_repair_superseded!==true &&
    Boolean(node.url);
}
function prompt(node={}){
  const key=text(node.metadata?.material_truth_key);
  return [
    "Analyze this approved Avantiqo physical material reference and estimate a conservative render/lookdev material profile from visible evidence only.",
    "Return strict JSON with material_class, confidence, base_color_rgb_linear, metallic, roughness, ior, transmission, coat_weight, coat_roughness, anisotropy, subsurface_weight, microstructure, wetness_behavior, evidence, uncertainties.",
    "Material truth key: "+key+".",
    "Do not claim laboratory measurement. Values are conservative visual estimates for render consistency only.",
    "For glass, estimate IOR only when optical evidence supports it; otherwise return null.",
    "For skin, fabric, bark and mud, metallic must remain 0 unless visible evidence proves otherwise.",
    "Reject impossible values. Preserve uncertainty rather than inventing precision.",
  ].join("\n");
}
function valid(m={}){
  const confidence=finite(m.confidence);
  const rough=finite(m.roughness);
  const metallic=finite(m.metallic);
  const transmission=finite(m.transmission);
  return confidence!==null&&confidence>=0.85 &&
    rough!==null&&rough>=0&&rough<=1 &&
    metallic!==null&&metallic>=0&&metallic<=1 &&
    transmission!==null&&transmission>=0&&transmission<=1 &&
    text(m.material_class)&&list(m.evidence).length>0;
}
export async function ensureMaterialMeasurements({organization_id,creative_project_id}={}){
  const [nodes,tasks]=await Promise.all([
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
  ]);
  const created=[];const existing=[];
  for(const node of list(nodes).filter(node=>
    eligible(node) &&
    isMaterialTruthSourceCurrent(node,nodes)
  )){
    const identity="material-measurement:"+node.id+":"+(node.technical?.checksum||"none");
    const prior=tasks.find(t=>text(t.metadata?.material_measurement_identity)===identity);
    if(prior){existing.push(prior);continue;}
    const url=await signCreativeStorageReference({organization_id,reference:node.url,expires_in:1800});
    const instructions=prompt(node);
    const task=await ProductionTaskRuntime.create({
      organization_id,creative_project_id,production_graph_id:null,
      scene_id:node.metadata?.scene_id||null,shot_id:null,
      type:"EXECUTE_CAPABILITY",status:"WAITING",
      title:"Measure Material · "+(node.metadata?.material_truth_key||node.name||node.id),
      description:"Estimate conservative physical material properties from the approved Image Studio material reference.",
      service_id:"creative.materials.estimate",service_code:"creative.materials.estimate",capability:"creative.materials.estimate",provider_id:null,priority:26,
      input:{
        media_kind:"IMAGE",image:url,source:url,instructions,instructions_text:instructions,
        requirements:{
          material_measurement:true,material_asset_node_id:node.id,
          material_truth_key:node.metadata?.material_truth_key||null,
          visual_estimate_not_lab_measurement:true,minimum_confidence:0.85,
        },
        provider_parameters:{response_format:{type:"json_object"},material_truth_key:node.metadata?.material_truth_key||null},
      },
      cost:{estimated:0,actual:0,currency:null,approved:false},timing:{estimated_seconds:0},review:{required:false,approved:false},
      metadata:{contract:CREATIVE_IMAGE_MATERIAL_MEASUREMENT_CONTRACT,material_measurement:true,material_measurement_identity:identity,material_asset_node_id:node.id,quality_gate:false},
    });
    created.push(task);
  }
  return {contract:CREATIVE_IMAGE_MATERIAL_MEASUREMENT_CONTRACT,created,existing};
}
export async function reconcileMaterialMeasurements({organization_id,creative_project_id}={}){
  const [tasks,nodes]=await Promise.all([
    ProductionTaskRuntime.list({organization_id,creative_project_id}),
    CreativeAssetGraphRuntime.list({organization_id,creative_project_id}),
  ]);
  const sealed=[];const failed=[];
  for(const task of list(tasks).filter(t=>t.metadata?.material_measurement===true&&text(t.status)==="COMPLETED"&&t.metadata?.material_measurement_reconciled!==true)){
    const measurement=parse(task.output);
    const node=nodes.find(candidate=>text(candidate.id)===text(task.metadata?.material_asset_node_id))
      || await AssetGraphRepository.getById(task.metadata?.material_asset_node_id);
    if(!node)continue;
    const sourceCurrent=isMaterialTruthSourceCurrent(node,nodes);
    const pass=sourceCurrent&&valid(measurement||{});
    await AssetGraphRepository.update(node.id,{
      metadata:{
        ...object(node.metadata),
        material_measurement_sealed:pass,
        material_measurement_task_id:task.id,
        material_measurement_contract:CREATIVE_IMAGE_MATERIAL_MEASUREMENT_CONTRACT,
        material_measurement:pass?measurement:null,
        material_measurement_failed:!pass,
        material_truth_source_stale:!sourceCurrent,
      },
    });
    await ProductionTaskRuntime.update(task.id,{
      metadata:{...object(task.metadata),material_measurement_reconciled:true,material_measurement_sealed:pass},
      review:{required:false,approved:pass},
      output:{...object(task.output),material_measurement:measurement||null},
      ...(pass?{}:{
        status:"FAILED",
        error:sourceCurrent
          ?"IMAGE_MATERIAL_MEASUREMENT_INVALID"
          :"IMAGE_MATERIAL_TRUTH_SOURCE_STALE_DURING_MEASUREMENT",
      }),
    });
    (pass?sealed:failed).push(task);
  }
  return {contract:CREATIVE_IMAGE_MATERIAL_MEASUREMENT_CONTRACT,sealed,failed};
}
export const CreativeImageMaterialMeasurementRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_MATERIAL_MEASUREMENT_CONTRACT,
  ensure:ensureMaterialMeasurements,
  reconcile:reconcileMaterialMeasurements,
});
