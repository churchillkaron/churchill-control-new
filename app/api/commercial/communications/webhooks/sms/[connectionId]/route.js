export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { CredentialRuntime } from "@/lib/platform/service-runtime/credentials/runtime/CredentialRuntime";
import { resolveCommunicationConnectionById, ingestInboundCommunication } from "@/lib/commercial/communications/CommunicationWebhookRuntime";
import { validateTwilioSignature } from "@/lib/platform/channels/sms/TwilioSMSRuntime";

function text(value){ return String(value ?? "").trim(); }
function object(value){ return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function formObject(form){ const result={}; for(const [key,value] of form.entries()){ if(Object.prototype.hasOwnProperty.call(result,key)){ result[key]=Array.isArray(result[key])?[...result[key],String(value)]:[result[key],String(value)]; } else result[key]=String(value); } return result; }
function twiml(){ return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>',{status:200,headers:{"Content-Type":"text/xml; charset=utf-8"}}); }

export async function POST(request,{params}){
  try{
    const connectionId=text(params?.connectionId); if(!connectionId) return twiml();
    const connection=await resolveCommunicationConnectionById({provider:"sms",connectionId});
    if(!connection?.credentials_reference) return twiml();
    const credential=await CredentialRuntime.resolve(connection.credentials_reference,{organization_id:connection.organization_id});
    let secret={}; try{ secret=object(JSON.parse(credential?.secret_reference || "{}")); }catch{return twiml();}
    const form=await request.formData(); const payload=formObject(form);
    const expectedUrl=text(object(connection.metadata).inbound_url) || request.url;
    const signature=request.headers.get("x-twilio-signature");
    if(!validateTwilioSignature({authToken:secret.auth_token,signature,url:expectedUrl,params:payload})) return new NextResponse("Forbidden",{status:403});
    if(text(payload.AccountSid)!==text(secret.account_sid)) return new NextResponse("Forbidden",{status:403});
    const from=text(payload.From); const to=text(payload.To); const sid=text(payload.MessageSid || payload.SmsSid); const body=text(payload.Body);
    if(!from || !to || !sid) return twiml();
    const numMedia=Math.max(0,Number(payload.NumMedia)||0);
    await ingestInboundCommunication({
      connection,
      providerOverride:"sms",
      channelTypeOverride:"sms",
      externalMessageId:sid,
      externalThreadId:from,
      participantId:from,
      participantName:null,
      participantAddress:from,
      recipientAddress:to,
      messageType:numMedia>0?"FILE":"TEXT",
      body:body || (numMedia>0?`[SMS/MMS media · ${numMedia} attachment${numMedia===1?"":"s"}]`:"[SMS message]"),
      receivedAt:new Date().toISOString(),
      metadata:{twilio_account_sid:text(payload.AccountSid),twilio_messaging_service_sid:text(payload.MessagingServiceSid)||null,twilio_num_media:numMedia,sms_media_persistence:numMedia>0?"PENDING_SECURE_DOWNLOAD":null},
    });
    return twiml();
  }catch(error){ console.error("SMS_TWILIO_INBOUND_WEBHOOK_ERROR",error); return twiml(); }
}
