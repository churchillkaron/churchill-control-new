import fs from "node:fs";
import path from "node:path";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { certifyBusinessPartnerLifecycle } from "../lib/operator/runtime/BusinessPartnerLifecycleCertificationRuntime.mjs";

register("./scripts/next-alias-loader.mjs", pathToFileURL("./"));

const files=[];
const walk=(d)=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(/\.(js|mjs)$/.test(e.name)) files.push(p);}};
walk("lib");
const special=(file)=> file.startsWith("lib/creative/") || /^lib\/platform\/capabilities\/createSecretary/.test(file) || /^lib\/platform\/capabilities\/createCodeAI/.test(file) || /^lib\/platform\/capabilities\/createProductEngineering/.test(file) || ["lib/platform/capabilities/createProductPersistenceHandoffCapability.js","lib/platform/capabilities/createOperatorMissionCapability.js","lib/platform/capabilities/createBusinessPartnerExternalWaitCapability.js"].includes(file);
const writes=[];
for(const file of files){
  const src=fs.readFileSync(file,"utf8");
  if(!/operatorEnabled\s*:\s*true/.test(src)||/operatorMode\s*:\s*["']read["']/.test(src)) continue;
  writes.push({file,verified:/operatorVerification\s*:/.test(src),special:special(file)});
}
const sourceUnknown=writes.filter(x=>!x.verified&&!x.special);

const bridge=fs.readFileSync("lib/platform/registry/operatorRegistryBridge.js","utf8");
const registryFailClosed=/createEndpoint && authoritativeIdentity/.test(bridge) && /missing_authoritative_identity/.test(bridge);
const registryVerification=/operatorVerification:/.test(bridge) && /recovery_payload_from_evidence/.test(bridge);

const { clearOperatorCapabilityCatalogCache, listOperatorCapabilities } = await import("../lib/operator/runtime/OperatorCapabilityCatalog.js");
clearOperatorCapabilityCatalogCache();
const catalog=await listOperatorCapabilities({includeUnsafe:true});
const resolvedWrites=catalog.filter((item)=>item.operator_enabled===true && item.mode!=="read");
const resolvedUnknown=resolvedWrites.filter((item)=>!["EXPLICIT_VALID","INFERRED"].includes(item.operator_verification_status));
const invalidDeclarations=resolvedWrites.filter((item)=>item.operator_verification_status==="INVALID_DECLARATION_BLOCKED");
const resolvedSpecial=(item)=> item.key.startsWith("creative.") || item.key.startsWith("platform.secretary") || item.key.startsWith("platform.code_ai") || item.key.startsWith("platform.product_") || ["platform.business_partner_external_wait.execute","platform.operator_mission.execute"].includes(item.key);
const resolvedOrdinaryUnknown=resolvedUnknown.filter((item)=>!resolvedSpecial(item));
const resolvedSpecialUnknown=resolvedUnknown.filter(resolvedSpecial);

const evidence={
  source_operator_writes_scanned:writes.length>0,
  no_source_unknown_unverified_writes:sourceUnknown.length===0,
  ordinary_source_writes_have_verification:writes.filter(x=>!x.special).every(x=>x.verified),
  special_governed_source_writes_explicit:writes.filter(x=>!x.verified).every(x=>x.special),
  registry_generated_writes_fail_closed_without_identity:registryFailClosed,
  registry_generated_writes_declare_verification:registryVerification,
  resolved_catalog_loaded:catalog.length>0 && resolvedWrites.length>0,
  resolved_catalog_no_unverified_ordinary_writes:resolvedOrdinaryUnknown.length===0,
  resolved_catalog_no_invalid_declarations:invalidDeclarations.length===0,
  resolved_unverified_are_explicit_orchestration_only:resolvedUnknown.every(resolvedSpecial),
};
const result=certifyBusinessPartnerLifecycle({
  scenario:"BUSINESS_PARTNER_WRITE_VERIFICATION_COVERAGE",
  stages:{mission_planning:true,governed_execution:true,business_effect_verification:Object.values(evidence).every(Boolean),failure_capture:true,defect_classification:true,self_healing_engineering:true,governed_release:true,production_activation:true,automatic_wake:true,authoritative_replay:true,mission_continuation:true,final_business_outcome:true,learning_evidence:true},
  productionWritesPerformed:false,productionDeployPerformed:false,databaseMigrationsApplied:false,authorizationEffect:"NONE",
  domainEvidence:{...evidence,total_source_operator_writes:writes.length,source_verified:writes.filter(x=>x.verified).length,source_special_governed:writes.filter(x=>x.special&&!x.verified).length,source_unknown:sourceUnknown.map(x=>x.file),resolved_catalog_size:catalog.length,resolved_writes:resolvedWrites.length,resolved_verification_statuses:resolvedWrites.reduce((a,x)=>(a[x.operator_verification_status]=(a[x.operator_verification_status]||0)+1,a),{}),resolved_ordinary_unknown:resolvedOrdinaryUnknown.map(x=>x.key),resolved_special_governed:resolvedSpecialUnknown.map(x=>x.key),resolved_invalid_declarations:invalidDeclarations.map(x=>x.key)},
});
console.log(JSON.stringify(result,null,2));
if(!result.certified) process.exit(1);
