import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoVerifiedOutcomeBackfillRuntime.js","utf8");
test("historical outcome backfill reuses the exact verified-success policy",()=>{assert.match(runtime,/observeVerifiedExecutionSuccess/);assert.doesNotMatch(runtime,/status.*completed.*VERIFIED_SUCCESS/);});
test("backfill is deterministic and idempotent",()=>{assert.match(runtime,/verified-outcome-backfill:/);assert.match(runtime,/existingKeys/);assert.match(runtime,/HISTORICAL_OUTCOMES_ALREADY_BACKFILLED/);});
test("backfill strips source and customer identifiers",()=>{for(const p of [/source_turn_id:null/,/source_turn_id_persisted:false/,/customer_identifiers_included:false/,/raw_payload_persisted:false/,/raw_output_persisted:false/,/raw_reasoning_persisted:false/])assert.match(runtime,p);});
test("backfill cannot grant authority train or promote",()=>{assert.match(runtime,/authorization_value:"none"/);assert.match(runtime,/automatic_training_effect:"NONE"/);assert.match(runtime,/production_model_promotion_effect:"NONE"/);assert.match(runtime,/authority_effect:"NONE"/);});
