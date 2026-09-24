export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { consumeOAuthAuthorization } from "@/lib/platform/security/oauthAuthorizationState";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { deactivateOtherActiveScopedCredentials } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value){ return String(value ?? "").trim(); }
function callbackOrigin(requestUrl){ return new URL(text(process.env.YOUTUBE_OAUTH_CALLBACK_ORIGIN || process.env.GOOGLE_OAUTH_CALLBACK_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin)).origin; }
function safeReturnPath(authorization,organizationId){ const candidate=text(authorization?.metadata?.return_path); const allowed=`/workspace/${encodeURIComponent(organizationId)}/administration/communications-setup?onboarding=1`; return candidate===allowed?allowed:`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`; }
function destination(origin,authorization,organizationId,message){ const url=new URL(safeReturnPath(authorization,organizationId),origin); url.searchParams.set("message",message); url.searchParams.set("youtube","connected"); return url; }
async function exchange(code,requestUrl){
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:text(process.env.GOOGLE_CLIENT_ID),client_secret:text(process.env.GOOGLE_CLIENT_SECRET),code,grant_type:"authorization_code",redirect_uri:`${callbackOrigin(requestUrl)}/api/youtube/auth/callback`}),cache:"no-store"});
  const payload=await response.json().catch(()=>({})); if(!response.ok || !text(payload.access_token)) throw new Error(payload.error_description || payload.error || "YouTube token exchange failed"); return payload;
}
async function channelIdentity(accessToken){
  const url=new URL("https://www.googleapis.com/youtube/v3/channels"); url.searchParams.set("part","id,snippet"); url.searchParams.set("mine","true");
  const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`},cache:"no-store"}); const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(payload?.error?.message || "YouTube channel lookup failed");
  const rows=Array.isArray(payload.items)?payload.items:[]; if(!rows.length) throw new Error("No YouTube channel is available for this Google account");
  const row=rows[0]; return {id:text(row.id),title:text(row?.snippet?.title)||text(row.id),handle:text(row?.snippet?.customUrl)||null,thumbnail:text(row?.snippet?.thumbnails?.default?.url)||null};
}
async function ensureService(organizationId){
  const existing=await OrganizationServiceRuntime.get({organization_id:organizationId,service_id:"youtube"}).catch(()=>null);
  if(existing && String(existing.status||"").toUpperCase()==="ACTIVE") return existing;
  return OrganizationServiceRuntime.save({...(existing||{}),organization_id:organizationId,service_category_id:"marketing-social",service_id:"youtube",package_id:existing?.package_id || "core",status:"ACTIVE",managed_by:existing?.managed_by || "organization",authorization_required:true,usage_enabled:true,billing_enabled:true,billing_mode:existing?.billing_mode || "USAGE",pricing_mode:existing?.pricing_mode || "PROVIDER",fallback_enabled:false,activated_at:existing?.activated_at || new Date().toISOString(),metadata:{...(existing?.metadata||{}),connection_model:"ORGANIZATION_GOOGLE_OAUTH",upload_audit_approved:String(process.env.YOUTUBE_UPLOAD_AUDIT_APPROVED||"").toLowerCase()==="true"},configuration:existing?.configuration || {}});
}

export async function GET(request){
  const requestUrl=new URL(request.url); let authorization=null;
  try{
    const state=requestUrl.searchParams.get("state"); if(!state) throw new Error("YouTube connection validation failed or expired");
    authorization=await consumeOAuthAuthorization({state,provider:"youtube"});
    const providerError=requestUrl.searchParams.get("error") || requestUrl.searchParams.get("error_description"); if(providerError) throw new Error(`YouTube connection was not approved: ${providerError}`);
    const code=requestUrl.searchParams.get("code"); if(!code) throw new Error("Google did not return a YouTube authorization code");
    const tokens=await exchange(code,requestUrl); const channel=await channelIdentity(tokens.access_token); const organizationId=authorization.organization_id;
    const expiresAt=new Date(Date.now()+(Number(tokens.expires_in)||3600)*1000).toISOString();
    const secret={access_token:tokens.access_token,refresh_token:tokens.refresh_token || null,expires_at:expiresAt,scope:tokens.scope || null,token_type:tokens.token_type || "Bearer"};
    const credential=await CredentialRuntime.storeSecret({provider_id:"youtube",credential_type:"oauth_token",secret:JSON.stringify(secret),organization_id:organizationId,vault_name:`youtube-oauth-${organizationId}-${channel.id}`,vault_description:"Organization YouTube OAuth credential",metadata:{organization_id:organizationId,purpose:"ORGANIZATION_YOUTUBE_CONNECTION",enabled:true,channel_id:channel.id,channel_title:channel.title,channel_handle:channel.handle,token_obtained_at:new Date().toISOString()}});
    await deactivateOtherActiveScopedCredentials({provider_id:"youtube",organization_id:organizationId,purpose:"ORGANIZATION_YOUTUBE_CONNECTION",except_id:credential.id});
    const connection=await ChannelConnectionRuntime.connect({organization_id:organizationId,provider:"youtube",channel_type:"social",credentials_reference:credential.id,metadata:{account_id:channel.id,account_name:channel.title,channel_handle:channel.handle,channel_thumbnail_url:channel.thumbnail,connected_at:new Date().toISOString(),connection_model:"ORGANIZATION_GOOGLE_OAUTH",upload_audit_approved:String(process.env.YOUTUBE_UPLOAD_AUDIT_APPROVED||"").toLowerCase()==="true"}});
    await ChannelAssetRuntime.register({organization_id:organizationId,connection_id:connection.id,provider:"youtube",asset_type:"youtube_channel",external_id:channel.id,name:channel.title,selected_by_party_id:authorization.party_id || null,selected_at:new Date().toISOString(),metadata:{handle:channel.handle,thumbnail_url:channel.thumbnail}});
    const now=new Date().toISOString(); await supabaseAdmin.from("organization_channel_connections").update({authorized_by_party_id:authorization.party_id || null,authorized_at:now,updated_at:now}).eq("id",connection.id).eq("organization_id",organizationId);
    await ensureService(organizationId);
    return NextResponse.redirect(destination(authorization.return_origin || requestUrl.origin,authorization,organizationId,"YouTube channel connected."));
  }catch(error){ const organizationId=authorization?.organization_id || "unknown"; const origin=authorization?.return_origin || requestUrl.origin; const url=new URL(safeReturnPath(authorization,organizationId),origin); url.searchParams.set("message",error?.message || "YouTube connection failed"); return NextResponse.redirect(url); }
}
