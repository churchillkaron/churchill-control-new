import { createHash } from "node:crypto";
import { createOperatorIntelligenceReadTools } from "../../operator/runtime/OperatorIntelligenceToolBridgeRuntime.js";
import { normalizeBusinessObservationPair } from "./AvantiqoBusinessObservationNormalizerRuntime.js";
import { mapBusinessObservationsToDriverRows } from "./AvantiqoBusinessObservationDriverMapRuntime.js";

export const AVANTIQO_BUSINESS_PERIOD_COMPARISON_TOOL_CONTRACT = "AVANTIQO_BUSINESS_PERIOD_COMPARISON_TOOL_V1";

const text=(v,n=180)=>String(v??"").trim().slice(0,n);
const hash=(v)=>createHash("sha256").update(JSON.stringify(v??null)).digest("hex");

export async function createBusinessPeriodComparisonTools({ plan, actor={}, permissions=[], callerRequest=null, partyId=null, message="", onReadReceipt=null }={}) {
  if(!plan?.read_pairs?.length) return [];
  const keys=plan.read_pairs.map(r=>r.capability_key);
  const baselineReceipts=[]; const currentReceipts=[];
  const common={organizationId:plan.organization_id,entityId:plan.entity_id,partyId,actor,permissions,callerRequest,message,allowedCapabilityKeys:keys,maxTools:Math.max(1,keys.length)};
  const baselineTools=await createOperatorIntelligenceReadTools({...common,periodId:plan.baseline_period_id,onReadReceipt:(r)=>{baselineReceipts.push(r); if(typeof onReadReceipt==="function") onReadReceipt(r);}});
  const currentTools=await createOperatorIntelligenceReadTools({...common,periodId:plan.current_period_id,onReadReceipt:(r)=>{currentReceipts.push(r); if(typeof onReadReceipt==="function") onReadReceipt(r);}});
  const baselineTool=baselineTools.find(t=>t.name==="operator_live_read");
  const currentTool=currentTools.find(t=>t.name==="operator_live_read");
  if(!baselineTool||!currentTool) return [];
  return [{
    name:"business_period_compare_read", mutates:false, approval_required:false, max_result_chars:32000,
    description:"Execute the same diagnosis-selected governed read against baseline and current periods, then normalize only comparable observations and map them to explicit business drivers. Read only; no authority.",
    parameters:{type:"object",properties:{capability_key:{type:"string",enum:keys},payload:{type:"object",additionalProperties:true}},required:["capability_key"],additionalProperties:false},
    metadata:{contract:AVANTIQO_BUSINESS_PERIOD_COMPARISON_TOOL_CONTRACT,baseline_period_id:plan.baseline_period_id,current_period_id:plan.current_period_id,read_only:true,authority_effect:"NONE"},
    async execute(args={}){
      const key=text(args.capability_key,300);
      if(!keys.includes(key)) throw new Error("AVANTIQO_BUSINESS_COMPARISON_CAPABILITY_NOT_ALLOWED");
      const beforeCount=baselineReceipts.length, afterCount=currentReceipts.length;
      const baseline=await baselineTool.execute({capability_key:key,payload:args.payload||{}});
      const current=await currentTool.execute({capability_key:key,payload:args.payload||{}});
      const normalized=normalizeBusinessObservationPair({capability_key:key,baseline,current,scope:{organization_id:plan.organization_id,entity_id:plan.entity_id,baseline_period_id:plan.baseline_period_id,current_period_id:plan.current_period_id}});
      const pair=plan.read_pairs.find(r=>r.capability_key===key);
      const mapped=mapBusinessObservationsToDriverRows({observations:normalized.observations,allowed_driver_ids:pair?.supports_driver_ids||[]});
      const baselineReceipt=baselineReceipts.slice(beforeCount).at(-1)||null;
      const currentReceipt=currentReceipts.slice(afterCount).at(-1)||null;
      return {contract:AVANTIQO_BUSINESS_PERIOD_COMPARISON_TOOL_CONTRACT,status:normalized.status,capability_key:key,baseline_period_id:plan.baseline_period_id,current_period_id:plan.current_period_id,baseline_evidence:baseline,current_evidence:current,baseline_receipt:baselineReceipt,current_receipt:currentReceipt,comparison_pair_fingerprint:hash({capability_key:key,baseline_receipt:baselineReceipt?.result_fingerprint||null,current_receipt:currentReceipt?.result_fingerprint||null,baseline_period_id:plan.baseline_period_id,current_period_id:plan.current_period_id}),normalized,mapped,read_only:true,authority_effect:"NONE"};
    }
  }];
}

export const AvantiqoBusinessPeriodComparisonToolRuntime=Object.freeze({contract:AVANTIQO_BUSINESS_PERIOD_COMPARISON_TOOL_CONTRACT,create:createBusinessPeriodComparisonTools});
