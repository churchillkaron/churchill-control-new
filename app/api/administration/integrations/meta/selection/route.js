export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { fetchMetaMessagingPages, finalizeMetaOrganizationConnection } from "@/lib/platform/channels/meta/MetaOrganizationConnectionRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value){ return String(value ?? "").trim(); }
async function context(request, body = {}) {
  const url=new URL(request.url);
  const organizationId=text(body.organizationId || body.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
  const access=await requireOrganizationAccess({organizationId,request});
  if(!access.success){ const error=new Error(access.error || "Organization access denied"); error.status=access.status || 403; throw error; }
  const credentialId=text(request.cookies.get("meta_pending_credential_id")?.value);
  if(!credentialId){ const error=new Error("Meta Page selection expired. Start the Meta connection again."); error.status=410; throw error; }
  const credential=await CredentialRuntime.resolve(credentialId,{organization_id:access.organizationId});
  const metadata=credential?.metadata && typeof credential.metadata === "object" ? credential.metadata : {};
  if(!credential || credential.provider_id!=="meta" || credential.credential_type!=="oauth_user_token_pending_selection" || text(metadata.organization_id)!==access.organizationId || text(metadata.purpose)!=="META_PENDING_PAGE_SELECTION"){
    const error=new Error("Meta Page selection is invalid or expired"); error.status=410; throw error;
  }
  if(!metadata.expires_at || Date.parse(metadata.expires_at) <= Date.now()){
    const error=new Error("Meta Page selection expired. Start the Meta connection again."); error.status=410; throw error;
  }
  return {access,credential,metadata};
}
function sanitized(page){ return {id:text(page.id),name:text(page.name)||text(page.id),instagram_business_id:text(page?.instagram_business_account?.id)||null,instagram_username:text(page?.instagram_business_account?.username)||null}; }
async function deactivate(id){ await supabaseAdmin.from("provider_credentials").update({status:"INACTIVE"}).eq("id",id).eq("provider_id","meta"); }

export async function GET(request){
  try{
    const {access,credential}=await context(request);
    const pages=await fetchMetaMessagingPages({accessToken:credential.secret_reference});
    return NextResponse.json({success:true,organizationId:access.organizationId,pages:pages.map(sanitized)});
  }catch(error){ return NextResponse.json({success:false,error:error?.message || "Unable to load Meta Pages"},{status:error?.status || 500}); }
}

export async function POST(request){
  let credentialId=null;
  try{
    const body=await request.json().catch(()=>({}));
    const pageId=text(body.pageId || body.page_id);
    if(!pageId) return NextResponse.json({success:false,error:"pageId required"},{status:400});
    const {access,credential,metadata}=await context(request,body);
    credentialId=credential.id;
    const result=await finalizeMetaOrganizationConnection({organizationId:access.organizationId,userAccessToken:credential.secret_reference,pageId,origin:text(metadata.origin) || new URL(request.url).origin});
    await deactivate(credential.id);
    const response=NextResponse.json({success:true,organizationId:access.organizationId,page:result.page,returnPath:text(metadata.return_path)||null});
    response.cookies.delete("meta_pending_credential_id");
    return response;
  }catch(error){
    if(credentialId) await deactivate(credentialId).catch(()=>null);
    return NextResponse.json({success:false,error:error?.message || "Meta Page selection failed"},{status:error?.status || 500});
  }
}
