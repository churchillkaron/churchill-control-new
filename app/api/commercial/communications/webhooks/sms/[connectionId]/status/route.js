export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { resolveCommunicationConnectionById, applyCommunicationDeliveryStatus } from "@/lib/commercial/communications/CommunicationWebhookRuntime";
import { applyStaffPhoneVerificationDeliveryStatus } from "@/lib/people/workforce/StaffPhoneVerificationRuntime";
import { validateTwilioSignature } from "@/lib/platform/channels/sms/TwilioSMSRuntime";

function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function formObject(form){ const result={}; for(const [key,value] of form.entries()){ if(Object.prototype.hasOwnProperty.call(result,key)){ result[key]=Array.isArray(result[key])?[...result[key],String(value)]:[result[key],String(value)]; } else result[key]=String(value); } return result; }
function mapStatus(value){ const status=text(value).toLowerCase(); if(status==="sent") return "SENT"; if(status==="delivered") return "DELIVERED"; if(status==="read") return "READ"; if(status==="failed" || status==="undelivered") return "FAILED"; return null; }

export async function POST(request,{params}){
  try{
    const connectionId=text(params?.connectionId); if(!connectionId) return NextResponse.json({ok:true});
    const connection=await resolveCommunicationConnectionById({provider:"sms",connectionId});
    if(!connection?.credentials_reference) return NextResponse.json({ok:true});
    const credential=await CredentialRuntime.resolve(connection.credentials_reference,{organization_id:connection.organization_id});
    let secret={}; try{ secret=object(JSON.parse(credential?.secret_reference || "{}")); }catch{return NextResponse.json({ok:true});}
    const form=await request.formData(); const payload=formObject(form);
    const expectedUrl=text(object(connection.metadata).status_callback_url) || request.url;
    const signature=request.headers.get("x-twilio-signature");
    if(!validateTwilioSignature({authToken:secret.auth_token,signature,url:expectedUrl,params:payload})) return new NextResponse("Forbidden",{status:403});
    if(text(payload.AccountSid)!==text(secret.account_sid)) return new NextResponse("Forbidden",{status:403});
    const messageSid=text(payload.MessageSid || payload.SmsSid); const status=mapStatus(payload.MessageStatus || payload.SmsStatus);
    if(messageSid && status){
      await Promise.all([
        applyCommunicationDeliveryStatus({connection,providerOverride:"sms",externalMessageId:messageSid,status,errorCode:text(payload.ErrorCode)||null,errorMessage:status==="FAILED"?`Twilio SMS delivery failed${payload.ErrorCode?` (${payload.ErrorCode})`:""}`:null,metadata:{twilio_message_status:text(payload.MessageStatus || payload.SmsStatus),twilio_error_code:text(payload.ErrorCode)||null}}),
        applyStaffPhoneVerificationDeliveryStatus({externalMessageId:messageSid,status}).catch(()=>null),
      ]);
    }
    return NextResponse.json({ok:true});
  }catch(error){ console.error("SMS_TWILIO_STATUS_WEBHOOK_ERROR",error); return NextResponse.json({ok:true}); }
}
