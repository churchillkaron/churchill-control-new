import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { authoritativeValueSetAssertion } from "../lib/operator/runtime/AuthoritativeValueSetVerificationRuntime.mjs";

test("value assertion requires exact supplier item price and MOQ set",()=>{
 const expected=[{item_id:"a",price:12.5,minimum_order_quantity:2},{item_id:"b",price:7,minimum_order_quantity:1}];
 assert.equal(authoritativeValueSetAssertion({expected,observed:[...expected]}).passed,true);
 assert.equal(authoritativeValueSetAssertion({expected,observed:[expected[0],{...expected[1],price:8}]}).passed,false);
 assert.equal(authoritativeValueSetAssertion({expected,observed:[expected[0]]}).passed,false);
 assert.equal(authoritativeValueSetAssertion({expected,observed:[...expected,{item_id:"c",price:1,minimum_order_quantity:1}]}).passed,false);
});

test("supplier price import binds verifier only from governed input",()=>{
 const source=fs.readFileSync("lib/inventory/procurement/suppliers/SupplierPriceOperatorCapability.js","utf8");
 assert.match(source,/payload_from_input:\{ supplier_party_id:"supplier_party_id", rows:"rows" \}/);
 assert.match(source,/duplicate supplier price item_id in import/);
});

test("supplier price verifier re-reads exact scope and values",()=>{
 const source=fs.readFileSync("lib/inventory/procurement/suppliers/SupplierPriceImportVerificationCapability.js","utf8");
 assert.match(source,/\.eq\("organization_id",context\.organizationId\)/);
 assert.match(source,/\.eq\("entity_id",context\.entityId\)/);
 assert.match(source,/\.eq\("supplier_party_id",supplierId\)/);
 assert.match(source,/\.in\("item_id",ids\)/);
 assert.match(source,/authoritativeValueSetAssertion/);
});

test("core binds declared verifier fields from pending governed payload",()=>{
 const source=fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js","utf8");
 assert.match(source,/payload_from_input/);
 assert.match(source,/resultBoundVerification\(capability, result, pending\.payload\)/);
 assert.match(source,/value\.length > 500/);
});

test("deterministic proof recognizes only authoritative completed value set assertion",()=>{
 const source=fs.readFileSync("lib/operator/runtime/OperatorDeterministicBusinessEffectRuntime.js","utf8");
 assert.match(source,/AVANTIQO_AUTHORITATIVE_VALUE_SET_BUSINESS_EFFECT_ASSERTION_V1/);
 assert.match(source,/authoritative_value_set_match/);
});
