import test from "node:test";
import assert from "node:assert/strict";
import { executeBusinessInternalEvidenceBatch } from "../lib/intelligence/runtime/AvantiqoBusinessInternalEvidenceBatchRuntime.js";

const plan={read_pairs:[{capability_key:"finance.profit_loss.read"},{capability_key:"finance.trial_balance.read"}],excluded_reads:[{capability_key:"finance.cash_management.read",reason:"CURRENT_STATE_ONLY"}]};

test("batch executes every safe pair exactly once and aggregates evidence",async()=>{const calls=[];const tool={execute:async({capability_key})=>{calls.push(capability_key);return {status:"OBSERVATIONS_READY",capability_key,mapped:{driver_rows:[]},normalized:{observations:[]}};}};const r=await executeBusinessInternalEvidenceBatch({plan,comparison_tool:tool});assert.deepEqual(calls,["finance.profit_loss.read","finance.trial_balance.read"]);assert.equal(r.status,"COMPLETED");assert.equal(r.comparison_results.length,2);assert.equal(r.authority_effect,"NONE");});

test("batch preserves individual failure as gap and continues",async()=>{const calls=[];const tool={execute:async({capability_key})=>{calls.push(capability_key);if(capability_key==="finance.profit_loss.read") throw Object.assign(new Error("fail"),{code:"READ_FAIL"});return {status:"OBSERVATIONS_READY",capability_key,mapped:{driver_rows:[]},normalized:{observations:[]}};}};const r=await executeBusinessInternalEvidenceBatch({plan,comparison_tool:tool});assert.equal(calls.length,2);assert.equal(r.status,"COMPLETED_WITH_GAPS");assert.deepEqual(r.failed_capability_keys,["finance.profit_loss.read"]);assert.equal(r.comparison_results[0].status,"EVIDENCE_GAP");});

test("time-unsafe excluded reads are never executed",async()=>{const calls=[];const tool={execute:async({capability_key})=>{calls.push(capability_key);return {status:"OBSERVATIONS_READY",capability_key,mapped:{driver_rows:[]},normalized:{observations:[]}};}};const r=await executeBusinessInternalEvidenceBatch({plan,comparison_tool:tool});assert.ok(!calls.includes("finance.cash_management.read"));assert.equal(r.excluded_reads[0].capability_key,"finance.cash_management.read");});
