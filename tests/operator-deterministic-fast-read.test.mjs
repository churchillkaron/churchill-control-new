import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { listOperatorFastReads } from "../lib/operator/runtime/OperatorFastReadIndex.js";
import { deterministicFastReadReply } from "../lib/operator/runtime/OperatorDeterministicFastReadPresentation.js";

const fast = fs.readFileSync("lib/operator/runtime/OperatorFastConversationRuntime.js","utf8");
const bridge = fs.readFileSync("lib/operator/runtime/OperatorIntelligenceToolBridgeRuntime.js","utf8");

test("wallet is available through deterministic fast read index",()=>{
  assert.ok(listOperatorFastReads().some((item)=>item.key==="services.wallet.read" && item.direct_endpoint==="/api/platform/wallet"));
});

test("wallet deterministic response needs no model",()=>{
  assert.equal(deterministicFastReadReply({capabilityKey:"services.wallet.read",result:{wallet:{currency:"THB",available_balance:"123.45",reserved_balance:"2.00",status:"ACTIVE"}}}),"Current Services wallet: THB 123.45 available, 2.00 reserved, status ACTIVE.");
});

test("fast evidence lane attempts authenticated direct read before local reasoning",()=>{
  assert.match(fast,/executeStrongestDirectOperatorRead/);
  assert.match(fast,/deterministic_direct_read: true/);
  assert.match(fast,/local_model_used: false/);
  assert.match(fast,/execution: \{ status: "completed"/);
  assert.ok(fast.indexOf("executeStrongestDirectOperatorRead") < fast.indexOf("reasoningModule.AvantiqoIntelligenceReasoningRuntime.run"));
});

test("direct read resolver is strong-match only and read-only",()=>{
  assert.match(bridge,/directReadConfidence/);
  assert.match(bridge,/resolution\.strong/);
  assert.match(bridge,/!capability\?\.direct_endpoint/);
  assert.match(bridge,/externalResearchRequested\(message\)/);
});

test("targeted deterministic list reads filter current rows without a model",()=>{
  const reply=deterministicFastReadReply({capabilityKey:"finance.customer_invoices.read",message:"show Moonshine invoice",result:{count:2,invoices:[{customer_name:"Moonshine",invoice_number:"INV-1"},{customer_name:"Other",invoice_number:"INV-2"}]}});
  assert.equal(reply,"I found 1 current record: Moonshine.");
});

test("strong deterministic reads fail fast instead of falling back into GPU reasoning",()=>{
  assert.doesNotMatch(fast,/executeStrongestDirectOperatorRead\([\s\S]{0,900}?\.catch\(\(\) => null\)/);
  assert.match(bridge,/AbortSignal\.timeout\(8000\)/);
});
