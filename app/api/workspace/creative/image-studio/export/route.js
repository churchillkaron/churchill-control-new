export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { loadImageStudioWorkspace, createImageStudioExport } from "@/lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository.js";
import { renderImageStudioMaster } from "@/lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js";
import { assessImageStudioComposition } from "@/lib/creative/stills/runtime/CreativeImageStudioQualityPreflightRuntime.js";

const clean=(v)=>String(v??"").trim();
export async function POST(request){
 try{
  const body=await request.json(); const organizationId=clean(body.organization_id); const projectId=clean(body.project_id); const artboardId=clean(body.artboard_id);
  if(!organizationId||!projectId||!artboardId)return NextResponse.json({success:false,error:"organization_id, project_id and artboard_id required"},{status:400});
  const access=await requireOrganizationAccess({organizationId,request}); if(!access.success)return NextResponse.json({success:false,error:access.error},{status:access.status||403});
  const {data:project,error:projectError}=await supabaseAdmin.from("creative_projects").select("id,organization_id,archived").eq("id",projectId).eq("organization_id",access.organizationId).maybeSingle();
  if(projectError)throw projectError; if(!project||project.archived)return NextResponse.json({success:false,error:"Creative project not found in organization"},{status:404});
  const workspace=await loadImageStudioWorkspace({organization_id:access.organizationId,creative_project_id:projectId});
  const artboard=workspace.artboards.find(x=>x.id===artboardId); if(!artboard)return NextResponse.json({success:false,error:"Artboard not found"},{status:404});
  const layers=workspace.layers.filter(x=>x.artboard_id===artboardId); const preflight=assessImageStudioComposition({artboard,layers,comments:workspace.comments.filter(x=>x.artboard_id===artboardId)}); const rendered=await renderImageStudioMaster({organization_id:access.organizationId,creative_project_id:projectId,artboard,layers,format:body.format||"PNG"});
  await createImageStudioExport({id:crypto.randomUUID(),organization_id:access.organizationId,creative_project_id:projectId,artboard_id:artboardId,export_type:rendered.format,status:"COMPLETED",settings:{width:rendered.width,height:rendered.height,mime_type:rendered.mime_type},evidence:{contract:rendered.contract,deterministic:true,quality_preflight:preflight},completed_at:new Date().toISOString()});
  return new NextResponse(rendered.bytes,{status:200,headers:{"content-type":rendered.mime_type,"content-disposition":`attachment; filename="image-studio-${artboardId}.${rendered.file_extension}"`,"x-avantiqo-contract":rendered.contract,"x-avantiqo-quality-score":String(preflight.score)}});
 }catch(error){console.error("CREATIVE_IMAGE_STUDIO_EXPORT_FAILED",error);return NextResponse.json({success:false,error:error?.message||"Unable to export Image Studio master"},{status:500});}
}
