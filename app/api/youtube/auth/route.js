export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const MANAGER_ROLES = new Set(["OWNER","ORGANIZATION_OWNER","ORG_OWNER","PLATFORM_OWNER","SUPER_ADMIN","ADMIN","MANAGER"]);
function text(value){ return String(value ?? "").trim(); }
function canManage(access){ return [access?.role,access?.access?.role,access?.membership?.role,access?.staff?.role].map((value)=>text(value).toUpperCase()).some((role)=>MANAGER_ROLES.has(role)); }
function callbackOrigin(requestUrl){
  const candidate=text(process.env.YOUTUBE_OAUTH_CALLBACK_ORIGIN || process.env.GOOGLE_OAUTH_CALLBACK_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin);
  return new URL(candidate).origin;
}

export async function GET(request){
  try{
    const url=new URL(request.url);
    const organizationId=url.searchParams.get("organizationId") || url.searchParams.get("organization_id");
    const access=await requireOrganizationAccess({organizationId,request});
    if(!access.success) return NextResponse.json({success:false,error:access.error || "Organization access denied"},{status:access.status || 403});
    if(!canManage(access)) return NextResponse.json({success:false,error:"Owner, administrator, or manager access is required to connect YouTube"},{status:403});
    const clientId=text(process.env.GOOGLE_CLIENT_ID);
    if(!clientId || !text(process.env.GOOGLE_CLIENT_SECRET)) return NextResponse.json({success:false,error:"YouTube OAuth is not configured by Avantiqo yet"},{status:503});
    const returnPath=url.searchParams.get("onboarding") === "1"
      ? `/workspace/${encodeURIComponent(access.organizationId)}/administration/communications-setup?onboarding=1`
      : null;
    const {state}=await createOAuthAuthorization({provider:"youtube",purpose:"organization_youtube_connection",organizationId:access.organizationId,partyId:access.staff?.party_id || null,returnOrigin:url.origin,metadata:{user_id:access.userId || null,...(returnPath?{return_path:returnPath}:{})}});
    const authorize=new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorize.searchParams.set("client_id",clientId);
    authorize.searchParams.set("redirect_uri",`${callbackOrigin(url)}/api/youtube/auth/callback`);
    authorize.searchParams.set("response_type","code");
    authorize.searchParams.set("access_type","offline");
    authorize.searchParams.set("include_granted_scopes","true");
    authorize.searchParams.set("prompt","consent");
    authorize.searchParams.set("state",state);
    authorize.searchParams.set("scope",[
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
    ].join(" "));
    return NextResponse.redirect(authorize);
  }catch(error){ return NextResponse.json({success:false,error:error?.message || "YouTube authorization failed"},{status:500}); }
}
