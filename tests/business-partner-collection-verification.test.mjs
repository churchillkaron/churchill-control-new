import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { authoritativeCollectionAssertion } from "../lib/operator/runtime/AuthoritativeCollectionVerificationRuntime.mjs";
import { deterministicBusinessEffectProof } from "../lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js";

const read=(file)=>fs.readFileSync(file,"utf8");
test("collection assertion requires exact identity-set equality",()=>{
  assert.equal(authoritativeCollectionAssertion({expected:["a","b"],observed:["b","a"]}).passed,true);
  assert.equal(authoritativeCollectionAssertion({expected:["a","b"],observed:["a"]}).passed,false);
  assert.equal(authoritativeCollectionAssertion({expected:["a"],observed:["a","b"]}).passed,false);
});
test("deterministic proof accepts only authoritative completed collection assertion",()=>{
  const proof=deterministicBusinessEffectProof({post_action_verification:{status:"completed",result:{business_effect_assertion:{contract:"AVANTIQO_AUTHORITATIVE_COLLECTION_BUSINESS_EFFECT_ASSERTION_V1",passed:true,authoritative_server_evidence:true,exact_business_scope_matched:true,expected_count:2,observed_count:2,collection_identity:"pack:2"}}}});
  assert.equal(proof.passed,true); assert.equal(proof.method,"authoritative_collection_identity_set_match");
});
test("document pack binds every returned document id",()=>{
  const source=read("lib/documents/runtime/DocumentsOperatorCapability.js"); const verifier=read("lib/documents/runtime/DocumentsPackVerificationCapability.js");
  assert.match(source,/payload_array_from_result:[\s\S]*pack\.documents[\s\S]*item_path: "id"/);
  assert.match(verifier,/\.in\("id",ids\)/); assert.match(verifier,/authoritativeCollectionAssertion/);
});
test("inventory import verifies union of created and existing identities",()=>{
  const source=read("lib/inventory/runtime/InventoryOperatorCapability.js"); const verifier=read("lib/inventory/runtime/InventoryItemsImportVerificationCapability.js");
  assert.match(source,/created_ids:[\s\S]*allow_empty: true/); assert.match(source,/existing_ids:[\s\S]*allow_empty: true/);
  assert.match(verifier,/\.eq\("organization_id",context\.organizationId\)\.eq\("entity_id",context\.entityId\)\.in\("id",ids\)/);
  assert.match(verifier,/authoritativeCollectionAssertion/);
});
test("core collection binding is server-declared and bounded",()=>{
  const core=read("lib/operator/runtime/OperatorTurnRuntimeCore.js");
  assert.match(core,/payload_array_from_result/); assert.match(core,/source\.length > 500/); assert.match(core,/config\.allow_empty !== true/);
  assert.match(core,/\["string", "number"\]\.includes\(typeof item\)/);
});
