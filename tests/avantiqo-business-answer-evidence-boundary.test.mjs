import test from "node:test";
import assert from "node:assert/strict";
import { enforceBusinessAnswerEvidenceBoundary as enforce } from "../lib/intelligence/runtime/AvantiqoBusinessAnswerEvidenceBoundaryRuntime.js";

const incomplete={metric:"profit",explanation_complete:false,facts:[{kind:"TARGET_METRIC",metric:"profit",baseline_value:100,actual_value:80},{kind:"INTERNAL_DRIVER",driver_id:"revenue",contribution_amount:-10}],supported_external_context:[],unresolved:[{kind:"MATERIAL_UNEXPLAINED_RESIDUAL",amount:-10,ratio:.5},{kind:"EXTERNAL_CONTEXT_UNRESOLVED",context_id:"weather",causal_state:"PLAUSIBLE_HYPOTHESIS"}]};

test("overclaim fails closed to deterministic evidence-safe answer",()=>{const out=enforce({result:{response:"This is fully explained and definitely caused by weather."},answer_brief:incomplete});assert.equal(out.enforcement.status,"REPLACED_OVERCLAIM");assert.match(out.result.response,/not fully explained/i);assert.match(out.result.response,/observed contributions/i);assert.doesNotMatch(out.result.response,/definitely caused/i);});

test("missing uncertainty gets deterministic disclosure appended",()=>{const out=enforce({result:{response:"Profit fell from the prior period."},answer_brief:incomplete});assert.equal(out.enforcement.status,"APPENDED_REQUIRED_UNCERTAINTY");assert.match(out.result.response,/material unexplained residual remains/i);});

test("already bounded answer passes unchanged",()=>{const response="Profit fell, but a material unexplained residual remains and weather is unresolved.";const out=enforce({result:{response},answer_brief:incomplete});assert.equal(out.enforcement.status,"PASS");assert.equal(out.result.response,response);});

test("complete explanation does not trigger incomplete-evidence guard",()=>{const brief={explanation_complete:true,facts:[],supported_external_context:[],unresolved:[]};const response="The verified comparison is fully explained by the reconciled evidence.";const out=enforce({result:{response},answer_brief:brief});assert.equal(out.enforcement.status,"PASS");assert.equal(out.result.response,response);});
