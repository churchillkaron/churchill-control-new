import fs from "node:fs/promises";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";
import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import { CREATIVE_ASSET_NODE_STATUS, CREATIVE_ASSET_NODE_TYPES } from "@/lib/creative/assets/graph/documents/CreativeAssetNode";
import { AVANTIQO_FONT_LIBRARY } from "@/lib/creative/design/registry/CreativeFontLibraryRegistry.js";
import { resolveCreativeDesignFont } from "@/lib/creative/design/runtime/CreativeDesignFontResolverRuntime.js";

const text=(value)=>String(value??"").trim();
const renderable=(node)=>node?.type===CREATIVE_ASSET_NODE_TYPES.FONT&&text(node.url)&&![CREATIVE_ASSET_NODE_STATUS.REJECTED,CREATIVE_ASSET_NODE_STATUS.ARCHIVED].includes(node.status);
export function imageStudioFontCssFamily(fontAssetId){return `AvantiqoImageStudio-${text(fontAssetId).replace(/[^A-Za-z0-9_-]/g,"-")}`;}
export async function listImageStudioFontCatalog({organization_id,creative_project_id}={}){
 const organizationId=text(organization_id),projectId=text(creative_project_id); if(!organizationId||!projectId)throw new Error("IMAGE_STUDIO_FONT_SCOPE_REQUIRED");
 const nodes=await AssetGraphRepository.listByProject({organization_id:organizationId,creative_project_id:projectId});
 const organizationFonts=(nodes||[]).filter(renderable).map((node)=>({id:node.id,family:text(node.metadata?.font_family||node.name),weight:Number(node.metadata?.font_weight||400),style:text(node.metadata?.font_style||"Regular"),source:"ORGANIZATION_FONT",brand_approved:node.status===CREATIVE_ASSET_NODE_STATUS.APPROVED||node.review?.approved===true||node.metadata?.brand_approved===true,license_verified:node.metadata?.font_license_verified===true||node.metadata?.license_verified===true}));
 const platformFonts=AVANTIQO_FONT_LIBRARY.map((entry)=>({id:entry.id,family:entry.family,weight:400,style:"Regular",source:"AVANTIQO_FONT_LIBRARY",brand_approved:false,license_verified:entry.license.verified,category:entry.category,scripts:entry.scripts,roles:entry.roles}));
 return {contract:"CREATIVE_IMAGE_STUDIO_FONT_CATALOG_V1",organization_fonts:organizationFonts,platform_fonts:platformFonts,fonts:[...organizationFonts,...platformFonts]};
}
export async function resolveImageStudioFont({organization_id,creative_project_id,font_asset_id}={}){
 const resolved=await resolveCreativeDesignFont({organization_id,creative_project_id,font_asset_id,exact:true});
 const node=resolved.asset_node; if(!node||!renderable(node))throw new Error(`IMAGE_STUDIO_FONT_NOT_RENDERABLE:${font_asset_id}`);
 return {contract:"CREATIVE_IMAGE_STUDIO_FONT_BINDING_V1",font_asset_id:node.id,family:resolved.font.family,weight:Number(resolved.font.weight||400),style:resolved.font.style||"Regular",source:resolved.source,css_family:imageStudioFontCssFamily(node.id),url:node.url,mime_type:node.technical?.mime_type||"font/ttf",license_verified:resolved.font.license_verified===true,brand_approved:resolved.font.brand_approved===true,node};
}
export async function materializeImageStudioFont(input={}){
 const binding=await resolveImageStudioFont(input); const material=await materializeMedia({url:binding.url,file_name:binding.node.metadata?.original_file_name||binding.node.technical?.original_file_name||`${binding.font_asset_id}.ttf`,mime_type:binding.mime_type,organization_id:input.organization_id,policy:{}});
 try{return {...binding,bytes:await fs.readFile(material.file_path),checksum:material.checksum||binding.node.technical?.checksum||null};}finally{await material.cleanup();}
}
export const CreativeImageStudioFontRuntime=Object.freeze({contract:"CREATIVE_IMAGE_STUDIO_FONT_RUNTIME_V1",list:listImageStudioFontCatalog,resolve:resolveImageStudioFont,materialize:materializeImageStudioFont,cssFamily:imageStudioFontCssFamily});
export default CreativeImageStudioFontRuntime;
