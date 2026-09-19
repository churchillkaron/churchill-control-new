import fs from "node:fs/promises";
import sharp from "sharp";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import { CreativeImageAssetDerivativeArtifactRuntime } from "@/lib/creative/image/runtime/CreativeImageAssetDerivativeArtifactRuntime";

export const CREATIVE_IMAGE_LOCALIZED_REPAIR_MASK_CONTRACT = "CREATIVE_IMAGE_LOCALIZED_REPAIR_MASK_V1";

function list(v){return Array.isArray(v)?v.filter(Boolean):[];}
function text(v){return String(v??"").trim();}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}

function pixelRect(region,width,height){
  const x=finite(region.x),y=finite(region.y),w=finite(region.width),h=finite(region.height);
  if([x,y,w,h].some(v=>v===null)) return null;
  const left=Math.max(0,Math.min(width-1,Math.floor(x*width)));
  const top=Math.max(0,Math.min(height-1,Math.floor(y*height)));
  const right=Math.max(left+1,Math.min(width,Math.ceil((x+w)*width)));
  const bottom=Math.max(top+1,Math.min(height,Math.ceil((y+h)*height)));
  return {left,top,width:right-left,height:bottom-top};
}

export async function createLocalizedRepairMask({
  organization_id,creative_project_id,creative_mission_id=null,
  parent_asset_node_id,continuity_group_id=null,source_reference,regions=[]
}={}){
  if(!organization_id||!creative_project_id) throw new Error("LOCALIZED_REPAIR_MASK_SCOPE_REQUIRED");
  if(!text(source_reference).startsWith("storage://")) throw new Error("LOCALIZED_REPAIR_MASK_STORAGE_SOURCE_REQUIRED");
  const media=await materializeMedia({
    organization_id,url:source_reference,file_name:"localized-repair-source.png",
    mime_type:"image/png",
  });
  try{
    const metadata=await sharp(media.file_path).metadata();
    const width=Number(metadata.width||0),height=Number(metadata.height||0);
    if(width<=0||height<=0) throw new Error("LOCALIZED_REPAIR_MASK_DIMENSIONS_REQUIRED");
    const rects=list(regions).map(region=>pixelRect(region,width,height)).filter(Boolean);
    if(!rects.length) throw new Error("LOCALIZED_REPAIR_MASK_REGIONS_REQUIRED");
    const overlays=await Promise.all(rects.map(async rect=>({
      input:await sharp({
        create:{width:rect.width,height:rect.height,channels:1,background:{r:255,g:255,b:255,alpha:1}}
      }).png().toBuffer(),
      left:rect.left,top:rect.top,
    })));
    const mask=await sharp({
      create:{width,height,channels:1,background:{r:0,g:0,b:0,alpha:1}}
    }).composite(overlays).png().toBuffer();
    const persisted=await CreativeImageAssetDerivativeArtifactRuntime.persist({
      organization_id,creative_project_id,creative_mission_id,
      parent_asset_node_id,continuity_group_id,
      derivative_type:"LOCALIZED_REPAIR_MASK",buffer:mask,mime_type:"image/png",extension:"png",
      capability:"avantiqo.image.localized-repair-mask",provider_id:"sharp",
      technical:{width,height,channels:1},
      metadata:{
        contract:CREATIVE_IMAGE_LOCALIZED_REPAIR_MASK_CONTRACT,
        technical_control_only:true,
        mask_semantics:"WHITE_EDIT_BLACK_PRESERVE",
        exact_unmasked_pixel_preservation_required:true,
        region_count:rects.length,
        normalized_regions:list(regions),
        release_approved:false,
      },
    });
    return {
      contract:CREATIVE_IMAGE_LOCALIZED_REPAIR_MASK_CONTRACT,
      asset_node_id:persisted.node.id,
      storage_reference:persisted.storage_reference,
      width,height,region_count:rects.length,
      mask_semantics:"WHITE_EDIT_BLACK_PRESERVE",
      provider_calls_performed:false,
    };
  }finally{
    await media.cleanup?.();
  }
}

export const CreativeImageLocalizedRepairMaskRuntime=Object.freeze({
  contract:CREATIVE_IMAGE_LOCALIZED_REPAIR_MASK_CONTRACT,
  create:createLocalizedRepairMask,
});
