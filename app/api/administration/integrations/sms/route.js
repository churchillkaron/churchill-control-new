export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { deactivateOtherActiveScopedCredentials } from "@/lib/platform/service-runtime/credentials/repositories/CredentialRepository";
import { ChannelConnectionRuntime } from "@/lib/platform/channels/runtime/ChannelConnectionRuntime";
import { ChannelAssetRuntime } from "@/lib/platform/channels/runtime/ChannelAssetRuntime";
import { OrganizationServiceRuntime } from "@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime";
import { configureTwilioInbound, validateTwilioSMSAccount } from "@/lib/platform/channels/sms/TwilioSMSRuntime";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
async function accessContext(request,body={}){
  const url=new URL(request.url); const organizationId=text(body.organizationId || body.organization_id || url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
  const access=await requireOrganizationAccess({organizationId,request});
  if(!access.success){ const error=new Error(access.error || "Organization access denied"); error.status=access.status || 403; throw error; }
  return access;
}
function publicOrigin(request){
  for(const candidate of [process.env.NEXT_PUBLIC_APP_URL,process.env.AVANTIQO_PUBLIC_ORIGIN,new URL(request.url).origin]){
    try{ const origin=new URL(text(candidate)).origin; if(origin.startsWith("https://")) return origin; }catch{}
  }
  throw new Error("SMS_PUBLIC_HTTPS_ORIGIN_REQUIRED");
}
async function snapshot(organizationId){
  const connection=await ChannelConnectionRuntime.get({organization_id:organizationId,provider:"sms"}).catch(()=>null);
  const assets=connection?.id?await ChannelAssetRuntime.list({organization_id:organizationId,connection_id:connection.id}):[];
  const sender=assets.find((asset)=>asset.asset_type==="sms_sender") || null;
  return {
    connection:connection?{id:connection.id,status:connection.status,webhookReady:object(connection.metadata).webhook_ready===true,providerName:text(object(connection.metadata).provider_name)||"Twilio",senderMode:text(object(connection.metadata).sender_mode)||null}:null,
    sender:sender?{id:sender.external_id,name:sender.name,fromNumber:text(object(sender.metadata).from_number)||null,messagingServiceSid:text(object(sender.metadata).messaging_service_sid)||null}:null,
  };
}
async function ensureService(organizationId){
  const existing=await OrganizationServiceRuntime.get({organization_id:organizationId,service_id:"sms"}).catch(()=>null);
  if(existing && String(existing.status||"").toUpperCase()==="ACTIVE") return existing;
  return OrganizationServiceRuntime.save({...(existing||{}),organization_id:organizationId,service_category_id:"communication",service_id:"sms",package_id:existing?.package_id||"growth",status:"ACTIVE",managed_by:existing?.managed_by||"organization",authorization_required:true,usage_enabled:true,billing_enabled:true,billing_mode:existing?.billing_mode||"USAGE",pricing_mode:existing?.pricing_mode||"PROVIDER",fallback_enabled:false,activated_at:existing?.activated_at||new Date().toISOString(),metadata:{...(existing?.metadata||{}),connection_model:"ORGANIZATION_TWILIO_SMS"},configuration:existing?.configuration||{}});
}
export async function GET(request){
  try{ const access=await accessContext(request); return NextResponse.json({success:true,organizationId:access.organizationId,...(await snapshot(access.organizationId))}); }
  catch(error){ return NextResponse.json({success:false,error:error?.message || "Unable to load SMS setup"},{status:error?.status || 500}); }
}
export async function POST(request){
  try{
    const body=await request.json().catch(()=>({})); const access=await accessContext(request,body); const action=text(body.action||"connect").toLowerCase();
    if(action==="disconnect"){
      const connection=await ChannelConnectionRuntime.get({organization_id:access.organizationId,provider:"sms"}).catch(()=>null);
      if(connection?.credentials_reference) await supabaseAdmin.from("provider_credentials").update({status:"INACTIVE"}).eq("id",connection.credentials_reference).eq("provider_id","sms");
      await ChannelConnectionRuntime.disconnect({organization_id:access.organizationId,provider:"sms"});
      return NextResponse.json({success:true,organizationId:access.organizationId,...(await snapshot(access.organizationId))});
    }
    const accountSid=text(body.accountSid || body.account_sid); const authToken=text(body.authToken || body.auth_token); const fromNumber=text(body.fromNumber || body.from_number); const messagingServiceSid=text(body.messagingServiceSid || body.messaging_service_sid);
    const validated=await validateTwilioSMSAccount({accountSid,authToken,fromNumber:fromNumber||null,messagingServiceSid:messagingServiceSid||null});
    const credential=await CredentialRuntime.storeSecret({provider_id:"sms",credential_type:"twilio_account",secret:JSON.stringify({account_sid:accountSid,auth_token:authToken,from_number:validated.fromNumber,messaging_service_sid:validated.messagingServiceSid}),organization_id:access.organizationId,vault_name:`sms-twilio-${access.organizationId}-${Date.now()}`,vault_description:"Organization Twilio SMS credential",metadata:{organization_id:access.organizationId,purpose:"ORGANIZATION_SMS_CONNECTION",enabled:true,twilio_account_sid:accountSid}});
    await deactivateOtherActiveScopedCredentials({provider_id:"sms",organization_id:access.organizationId,purpose:"ORGANIZATION_SMS_CONNECTION",except_id:credential.id});
    let connection=await ChannelConnectionRuntime.connect({organization_id:access.organizationId,provider:"sms",channel_type:"messaging",credentials_reference:credential.id,metadata:{provider_name:"Twilio",sender_mode:validated.messagingServiceSid?"MESSAGING_SERVICE":"PHONE_NUMBER",webhook_ready:false}});
    const origin=publicOrigin(request); const inboundUrl=`${origin}/api/commercial/communications/webhooks/sms/${encodeURIComponent(connection.id)}`; const statusCallbackUrl=`${inboundUrl}/status`;
    await configureTwilioInbound({accountSid,authToken,phoneSid:validated.phone?.sid||null,messagingServiceSid:validated.messagingServiceSid,inboundUrl,statusCallbackUrl});
    const credentialMetadata={...object(credential.metadata),status_callback_url:statusCallbackUrl,inbound_url:inboundUrl,twilio_phone_sid:text(validated.phone?.sid)||null,twilio_messaging_service_sid:validated.messagingServiceSid||null};
    const updatedCredential=await supabaseAdmin.from("provider_credentials").update({metadata:credentialMetadata,updated_at:new Date().toISOString()}).eq("id",credential.id).eq("provider_id","sms").select("id").single(); if(updatedCredential.error) throw updatedCredential.error;
    connection=await ChannelConnectionRuntime.connect({organization_id:access.organizationId,provider:"sms",channel_type:"messaging",credentials_reference:credential.id,metadata:{...object(connection.metadata),provider_name:"Twilio",sender_mode:validated.messagingServiceSid?"MESSAGING_SERVICE":"PHONE_NUMBER",webhook_ready:true,inbound_url:inboundUrl,status_callback_url:statusCallbackUrl,webhook_configured_at:new Date().toISOString()}});
    const senderId=validated.messagingServiceSid || validated.fromNumber;
    await ChannelAssetRuntime.register({organization_id:access.organizationId,connection_id:connection.id,provider:"sms",asset_type:"sms_sender",external_id:senderId,name:validated.fromNumber || validated.service?.friendly_name || validated.messagingServiceSid,selected_by_party_id:access.staff?.party_id||null,selected_at:new Date().toISOString(),metadata:{provider:"twilio",from_number:validated.fromNumber,messaging_service_sid:validated.messagingServiceSid,phone_sid:text(validated.phone?.sid)||null}});
    await ensureService(access.organizationId);
    return NextResponse.json({success:true,organizationId:access.organizationId,...(await snapshot(access.organizationId))});
  }catch(error){ return NextResponse.json({success:false,error:error?.message || "SMS setup failed"},{status:error?.status || 500}); }
}
