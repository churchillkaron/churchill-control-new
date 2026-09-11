import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { authoritativeCollectionAssertion } from "@/lib/operator/runtime/AuthoritativeCollectionVerificationRuntime.mjs";

const text = (value, limit = 500) => String(value ?? "").trim().slice(0, limit);
export function createDocumentsPackVerificationCapability() {
  const manifest = defineCapability({ domain:"documents", capability:"files", action:"verifyPack", description:"Verify the exact controlled-document identity set created by one governed document pack.", permissions:[], events:[], tags:["documents","verification","pack","read"], transactional:false, aiEnabled:false, operatorEnabled:true, operatorMode:"read", operatorAutoExecute:true, operatorRequiresConfirmation:false, risk:"low", contextScope:"organization", inputSchema:{type:"object",required:["document_ids"],properties:{document_ids:{type:"array",minItems:2,maxItems:20,items:{type:"string"}}},additionalProperties:false} });
  async function execute({context,payload={}}) {
    const access=await requireOrganizationAccess({organizationId:context.organizationId,request:context.callerRequest});
    if(!access.success) throw Object.assign(new Error(access.error||"DOCUMENT_PACK_VERIFY_ACCESS_REQUIRED"),{status:access.status||403});
    const ids=[...new Set((payload.document_ids||[]).map((v)=>text(v,160)).filter(Boolean))];
    if(ids.length<2||ids.length>20) throw new Error("DOCUMENT_PACK_VERIFY_IDS_REQUIRED");
    let query=supabaseAdmin.from("enterprise_documents").select("id,organization_id,entity_id,status,version_number,checksum_sha256").eq("organization_id",access.organizationId).in("id",ids);
    if(context.entityId) query=query.eq("entity_id",context.entityId);
    const {data,error}=await query; if(error) throw error;
    const rows=data||[];
    return { success:true, documents:rows, business_effect_assertion:authoritativeCollectionAssertion({expected:ids,observed:rows.map((r)=>r.id),collectionIdentity:`document_pack:${ids.length}`}) };
  }
  return {manifest,execute};
}
export default createDocumentsPackVerificationCapability;
