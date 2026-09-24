import crypto from "node:crypto";

function text(value){ return String(value ?? "").trim(); }
function basic(accountSid,authToken){ return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`; }
function validSid(value,prefix){ return new RegExp(`^${prefix}[0-9a-fA-F]{32}$`).test(text(value)); }
export function normalizeE164(value){ const v=text(value).replace(/[\s().-]/g,""); return /^\+[1-9]\d{7,14}$/.test(v)?v:null; }

export async function twilioJson({url,accountSid,authToken,method="GET",form=null}){
  const response=await fetch(url,{method,headers:{Authorization:basic(accountSid,authToken),...(form?{"Content-Type":"application/x-www-form-urlencoded"}:{})},...(form?{body:new URLSearchParams(form)}:{}),cache:"no-store"});
  const payload=await response.json().catch(()=>({})); if(!response.ok) throw new Error(payload?.message || `TWILIO_REQUEST_FAILED:${response.status}`); return payload;
}
export async function validateTwilioSMSAccount({accountSid,authToken,fromNumber=null,messagingServiceSid=null}){
  if(!validSid(accountSid,"AC") || !text(authToken)) throw new Error("TWILIO_ACCOUNT_CREDENTIAL_INVALID");
  await twilioJson({url:`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,accountSid,authToken});
  const normalized=fromNumber?normalizeE164(fromNumber):null;
  if(fromNumber && !normalized) throw new Error("TWILIO_FROM_NUMBER_E164_REQUIRED");
  if(messagingServiceSid && !validSid(messagingServiceSid,"MG")) throw new Error("TWILIO_MESSAGING_SERVICE_SID_INVALID");
  if(!normalized && !messagingServiceSid) throw new Error("TWILIO_SMS_SENDER_REQUIRED");
  let phone=null;
  if(normalized){
    const list=await twilioJson({url:`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalized)}&PageSize=20`,accountSid,authToken});
    phone=Array.isArray(list?.incoming_phone_numbers)?list.incoming_phone_numbers.find((row)=>text(row.phone_number)===normalized)||null:null;
    if(!phone?.sid) throw new Error("TWILIO_FROM_NUMBER_NOT_OWNED_BY_ACCOUNT");
  }
  let service=null;
  if(messagingServiceSid){
    service=await twilioJson({url:`https://messaging.twilio.com/v1/Services/${encodeURIComponent(messagingServiceSid)}`,accountSid,authToken});
    if(text(service.sid)!==text(messagingServiceSid)) throw new Error("TWILIO_MESSAGING_SERVICE_NOT_FOUND");
  }
  return {phone,service,fromNumber:normalized,messagingServiceSid:text(messagingServiceSid)||null};
}
export async function configureTwilioInbound({accountSid,authToken,phoneSid=null,messagingServiceSid=null,inboundUrl,statusCallbackUrl}){
  if(phoneSid){
    await twilioJson({url:`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${encodeURIComponent(phoneSid)}.json`,accountSid,authToken,method:"POST",form:{SmsUrl:inboundUrl,SmsMethod:"POST"}});
    return {mode:"PHONE_NUMBER",phoneSid};
  }
  if(messagingServiceSid){
    await twilioJson({url:`https://messaging.twilio.com/v1/Services/${encodeURIComponent(messagingServiceSid)}`,accountSid,authToken,method:"POST",form:{InboundRequestUrl:inboundUrl,InboundMethod:"POST",StatusCallback:statusCallbackUrl,UseInboundWebhookOnNumber:"false"}});
    return {mode:"MESSAGING_SERVICE",messagingServiceSid};
  }
  throw new Error("TWILIO_INBOUND_TARGET_REQUIRED");
}
export function validateTwilioSignature({authToken,signature,url,params}){
  if(!text(authToken)||!text(signature)||!text(url)) return false;
  const entries=[]; for(const [key,value] of Object.entries(params||{})){ if(Array.isArray(value)){ for(const item of value) entries.push([key,String(item)]); } else entries.push([key,String(value??"")]); }
  entries.sort((a,b)=>a[0]===b[0]?a[1].localeCompare(b[1]):a[0].localeCompare(b[0]));
  let payload=url; for(const [key,value] of entries) payload+=`${key}${value}`;
  const expected=crypto.createHmac("sha1",authToken).update(payload).digest("base64");
  const a=Buffer.from(expected); const b=Buffer.from(text(signature)); return a.length===b.length && a.length>0 && crypto.timingSafeEqual(a,b);
}
