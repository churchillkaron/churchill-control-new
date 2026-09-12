import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import { refreshSessionReadModel } from "@/lib/restaurant/read-models";
const permission="restaurant.session.customer.change";
const text=(v)=>String(v??"").trim();
export const manifest=defineCapability({domain:"restaurant",capability:"session",action:"read",description:"Read one exact organization-scoped restaurant session for authoritative post-action verification.",permissions:[permission],events:[],tags:["restaurant","session","read","verification"],transactional:false,aiEnabled:false,operatorEnabled:true,operatorMode:"read",operatorAutoExecute:true,operatorRequiresConfirmation:false,risk:"low",contextScope:"organization",inputSchema:{type:"object",required:["sessionId"],properties:{sessionId:{type:"string"}},additionalProperties:false}});
export function authorize({context}){return requireExecutionPermission(context,permission);}
export async function execute({context,payload={}}){const organizationId=text(context.organizationId),sessionId=text(payload.sessionId); if(!organizationId||!sessionId) throw new Error("organizationId and sessionId required"); const session=await refreshSessionReadModel({organizationId,sessionId}); return {success:true,sessionId:session.id,session,authoritative_server_evidence:true};}
export default {manifest,authorize,execute};
