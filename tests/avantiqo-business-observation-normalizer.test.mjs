import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBusinessObservationPair as normalize } from "../lib/intelligence/runtime/AvantiqoBusinessObservationNormalizerRuntime.js";

test("cash snapshots remain separated by currency",()=>{const r=normalize({capability_key:"finance.cash_management.read",baseline:{success:true,currency_positions:[{currency_code:"THB",bank_position:1000,scheduled_position_7d:900}]},current:{success:true,currency_positions:[{currency_code:"THB",bank_position:800,scheduled_position_7d:700}]}});assert.equal(r.status,"OBSERVATIONS_READY");assert.equal(r.observations.find(x=>x.measure_id==="cash_position").delta,-200);assert.equal(r.observations[0].dimension_key,"THB");});

test("attendance snapshots produce deterministic counts",()=>{const r=normalize({capability_key:"people.attendance.read",baseline:{success:true,staff:[1,2],schedules:[1,2,3],shifts:[1,2],attendance:[1,2],lateShifts:[1],pendingShifts:[]},current:{success:true,staff:[1,2],schedules:[1,2,3,4],shifts:[1,2,3],attendance:[1,2,3],lateShifts:[1,2],pendingShifts:[1]}});assert.equal(r.observations.find(x=>x.measure_id==="late_shifts").delta,1);});

test("stock snapshots quantify comparable quantity only",()=>{const r=normalize({capability_key:"supply_chain.stock_position.read",baseline:{success:true,metrics:{totalQuantity:100,itemCount:20}},current:{success:true,metrics:{totalQuantity:82,itemCount:20}}});assert.equal(r.observations.find(x=>x.measure_id==="inventory_quantity").delta,-18);});

test("unknown result shapes remain evidence gaps",()=>{const r=normalize({capability_key:"finance.trial_balance.read",baseline:{success:true},current:{success:true}});assert.equal(r.status,"EVIDENCE_GAP");assert.equal(r.reason,"NO_KNOWN_NORMALIZER");});

test("missing current measure is never invented",()=>{const r=normalize({capability_key:"finance.customer_invoices.read",baseline:{success:true,invoices:[{status:"OPEN",total_amount:100}]},current:{success:true}});assert.equal(r.status,"OBSERVATIONS_READY");assert.equal(r.observations.find(x=>x.measure_id==="invoice_count").actual_value,0);});
