import test from "node:test";
import assert from "node:assert/strict";
import { mapBusinessObservationsToDriverRows as map } from "../lib/intelligence/runtime/AvantiqoBusinessObservationDriverMapRuntime.js";

test("cash measure maps only to explicit cash driver",()=>{const r=map({observations:[{measure_id:"cash_position",baseline_value:1000,actual_value:800,source_capability_key:"finance.cash_management.read"}],allowed_driver_ids:["cash","cash_inflows"]});assert.equal(r.driver_rows[0].driver_id,"cash");assert.equal(r.driver_rows[0].actual_value,800);});

test("ambiguous invoice count never becomes revenue automatically",()=>{const r=map({observations:[{measure_id:"invoice_count",baseline_value:10,actual_value:8}],allowed_driver_ids:["revenue","volume"]});assert.equal(r.driver_rows.length,0);assert.equal(r.unmapped_observations[0].reason,"NO_EXPLICIT_MEASURE_DRIVER_MAPPING");});

test("mapped measure outside selected diagnosis remains unmapped",()=>{const r=map({observations:[{measure_id:"late_shifts",baseline_value:1,actual_value:3}],allowed_driver_ids:["cash"]});assert.equal(r.driver_rows.length,0);assert.equal(r.unmapped_observations[0].reason,"DRIVER_OUTSIDE_DIAGNOSIS");});
