import "./SMSCredentialRegistration.js";

function text(value){ return String(value ?? "").trim(); }
function normalizeE164(value){ const v=text(value).replace(/[\s().-]/g,""); return /^\+[1-9]\d{7,14}$/.test(v)?v:null; }

export const SMSProvider={
  id:"sms",
  async execute(input={}){
    if(input.capability!=="communication.sms.send") throw new Error(`SMS capability not supported: ${input.capability}`);
    const accountSid=text(input.account_sid); const authToken=text(input.auth_token);
    if(!/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !authToken) throw new Error("SMS_TWILIO_CREDENTIAL_REQUIRED");
    const to=normalizeE164(input.recipient || input.to); if(!to) throw new Error("SMS_RECIPIENT_E164_REQUIRED");
    const body=text(input.message || input.body); if(!body) throw new Error("SMS_MESSAGE_REQUIRED");
    const from=normalizeE164(input.from_number);
    const serviceSid=text(input.messaging_service_sid);
    if(!from && !/^MG[0-9a-fA-F]{32}$/.test(serviceSid)) throw new Error("SMS_SENDER_REQUIRED");
    const form=new URLSearchParams({To:to,Body:body});
    if(serviceSid) form.set("MessagingServiceSid",serviceSid); else form.set("From",from);
    if(text(input.status_callback_url)) form.set("StatusCallback",text(input.status_callback_url));
    const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,{
      method:"POST",
      headers:{Authorization:`Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,"Content-Type":"application/x-www-form-urlencoded"},
      body:form,
      cache:"no-store",
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok || !text(payload.sid)) throw new Error(payload?.message || `TWILIO_SMS_SEND_FAILED:${response.status}`);
    return {success:true,provider:"sms",output:{message_id:text(payload.sid),status:text(payload.status)||null,to,from:text(payload.from)||from||null,messaging_service_sid:serviceSid||null}};
  },
};
