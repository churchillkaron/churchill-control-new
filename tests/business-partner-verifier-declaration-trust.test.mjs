import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { normalizeOperatorVerificationDeclaration, safeVerificationPath } from "../lib/operator/runtime/OperatorCapabilityVerificationDeclaration.mjs";

function cap({ key, mode="write", scope="entity", input={}, enabled=true }) {
  const [domain, capability, action] = key.split(".");
  return { key, domain, capability, action, mode, context_scope:scope, operator_enabled:enabled, input_schema:{type:"object",properties:input,additionalProperties:false} };
}
const write=cap({key:"finance.invoice.create",input:{customer_id:{type:"string"},rows:{type:"array"}}});
const read=cap({key:"finance.invoice.read",mode:"read",input:{id:{type:"string"},rows:{type:"array"}}});
const catalog=[write,read];

test("normalizes safe server declaration",()=>assert.deepEqual(normalizeOperatorVerificationDeclaration({capability_key:read.key,payload_from_result:{id:["invoice.id","id"]}},write,catalog),{capability_key:read.key,payload_from_result:{id:["invoice.id","id"]}}));
test("rejects dangerous or excessive result paths",()=>{
  assert.equal(safeVerificationPath("invoice.__proto__.id"),null);
  assert.equal(safeVerificationPath("a.b.c.d.e.f.g.h.i"),null);
  assert.equal(normalizeOperatorVerificationDeclaration({capability_key:read.key,payload_from_result:{id:Array.from({length:9},(_,i)=>`r${i}.id`)}},write,catalog),null);
});
test("rejects unknown, write-mode, disabled, or weaker-scope verifier",()=>{
  assert.equal(normalizeOperatorVerificationDeclaration({capability_key:"finance.missing.read",payload_from_result:{id:["id"]}},write,catalog),null);
  assert.equal(normalizeOperatorVerificationDeclaration({capability_key:write.key,payload_from_result:{customer_id:["id"]}},write,catalog),null);
  const disabled={...read,operator_enabled:false};
  assert.equal(normalizeOperatorVerificationDeclaration({capability_key:read.key,payload_from_result:{id:["id"]}},write,[write,disabled]),null);
  assert.equal(normalizeOperatorVerificationDeclaration({capability_key:read.key,payload_from_result:{id:["id"]}},write,[write,{...read,context_scope:"organization"}]),null);
});
test("rejects verifier payload keys and input bindings outside schemas",()=>{
  assert.equal(normalizeOperatorVerificationDeclaration({capability_key:read.key,payload_from_result:{other:["id"]}},write,catalog),null);
  assert.equal(normalizeOperatorVerificationDeclaration({capability_key:read.key,payload_from_input:{rows:"invented"}},write,catalog),null);
});
test("core accepts only scalar result identities and safe bounded paths",()=>{
  const core=fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js","utf8");
  assert.match(core,/\["string", "number"\]\.includes\(typeof item\)/);
  assert.match(core,/keys\.length > 8/);
  assert.match(core,/"__proto__", "prototype", "constructor"/);
});
