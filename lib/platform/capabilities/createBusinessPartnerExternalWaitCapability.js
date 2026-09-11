import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerBusinessPartnerExternalWait } from "@/lib/operator/runtime/BusinessPartnerExternalWaitRuntime";

const text = (v,n=4000)=>String(v??"").trim().slice(0,n);
const object = (v)=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};

export function createBusinessPartnerExternalWaitCapability() {
  const manifest = defineCapability({
    domain:"platform", capability:"business_partner_external_wait", action:"execute",
    name:"Wait for External Business Event",
    description:"Persist a Business Partner mission checkpoint until one exact external event arrives. The event is evidence only and never mutation authority. Canonical waits: approval + APPROVAL_GRANTED/APPROVAL_REJECTED using approval_request:<id> or reference:<table>:<id>; finance + PAYMENT_SETTLED using payment:<id> or provider_reference:<ref>; supply-chain + GOODS_RECEIPT_RECEIVED using purchase_order:<id> or goods_receipt:<id>; communication:<provider> + MESSAGE_RECEIVED using conversation:<id>, thread:<external-thread-id>, or participant:<external-participant>; provider:<provider-id> uses the provider event type and external event id.",
    permissions:[], operatorEnabled:true, aiEnabled:true,
    operatorMode:"write", operatorAutoExecute:true, operatorRequiresConfirmation:false,
    transactional:false, risk:"low", reversible:true, contextScope:"organization",
    inputSchema:{ type:"object", required:["run_id","step_id","event_source","event_type","correlation_key","mission_checkpoint"], properties:{
      run_id:{type:"string"}, step_id:{type:"string"}, event_source:{type:"string"}, event_type:{type:"string"}, correlation_key:{type:"string"}, mission_checkpoint:{type:"object",additionalProperties:true}
    }, additionalProperties:false }, outputSchema:{type:"object",additionalProperties:true}
  });
  function authorize() { return true; }
  async function execute({context,payload={}}) {
    const row = await registerBusinessPartnerExternalWait({
      context,
      run:{run_id:text(payload.run_id,180), objective:text(object(payload.mission_checkpoint).objective,1200)},
      step:{id:text(payload.step_id,180)},
      wait_for:{event_source:text(payload.event_source,120),event_type:text(payload.event_type,180),correlation_key:text(payload.correlation_key,500),mission_checkpoint:object(payload.mission_checkpoint)},
    });
    return {
      status: row.status,
      wait_key: row.wait_key,
      run_id: row.run_id,
      step_id: row.step_id,
      event_received: row.status === "EVENT_RECEIVED",
      event_id: row.event_id || null,
      event_evidence: object(row.event_evidence),
      authorization_effect:"NONE",
    };
  }
  return {manifest,authorize,execute};
}
export default createBusinessPartnerExternalWaitCapability;
