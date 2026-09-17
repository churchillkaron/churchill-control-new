import test from "node:test";
import assert from "node:assert/strict";
import { buildBusinessComparisonEvidenceBundle as build } from "../lib/intelligence/runtime/AvantiqoBusinessComparisonEvidenceBundleRuntime.js";

const result=(driver_rows,status="OBSERVATIONS_READY")=>({capability_key:"people.attendance.read",status,comparison_pair_fingerprint:"fp",mapped:{driver_rows},normalized:{reason:status}});

test("single observed measure remains indicator only without contribution model",()=>{const b=build({comparison_results:[result([{driver_id:"staff_coverage",measure_id:"scheduled_shifts",baseline_value:10,actual_value:12,source_capability_key:"people.attendance.read"}])],required_driver_ids:["staff_coverage"]});assert.equal(b.contribution_rows.length,0);assert.deepEqual(b.indicator_driver_ids,["staff_coverage"]);assert.equal(b.driver_evidence[0].aggregation_state,"SINGLE_INDICATOR_MEASURE");assert.equal(b.evidence_coverage_complete,true);assert.equal(b.explanation_coverage_complete,false);});

test("multiple proxies for same driver are not summed",()=>{const rows=[{driver_id:"attendance_reliability",measure_id:"worked_shifts",baseline_value:8,actual_value:9},{driver_id:"attendance_reliability",measure_id:"late_shifts",baseline_value:1,actual_value:3}];const b=build({comparison_results:[result(rows)],required_driver_ids:["attendance_reliability"]});assert.equal(b.contribution_rows.length,0);assert.deepEqual(b.ambiguous_driver_ids,["attendance_reliability"]);assert.equal(b.driver_evidence[0].aggregation_state,"MULTIPLE_NON_ADDITIVE_PROXIES");});

test("missing drivers and capability gaps remain visible",()=>{const b=build({comparison_results:[result([],"EVIDENCE_GAP")],required_driver_ids:["cash"]});assert.deepEqual(b.missing_driver_ids,["cash"]);assert.equal(b.capability_gaps.length,1);assert.equal(b.coverage_complete,false);});
