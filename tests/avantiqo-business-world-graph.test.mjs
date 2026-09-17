import test from "node:test";import assert from "node:assert/strict";import {buildAvantiqoBusinessWorldGraph,businessConceptPath} from "../lib/intelligence/runtime/AvantiqoBusinessWorldGraphRuntime.js";
const caps=[
 {key:"finance.customer_invoices.read",domain:"finance",capability:"customer_invoices",action:"read",mode:"read",description:"Read current customer invoices"},
 {key:"finance.customer_receipt.post",domain:"finance",capability:"customer_receipt",action:"post",mode:"write",description:"Post customer payment receipt",operator_verification:{capability_key:"finance.customer_receipt.read"}},
 {key:"people.attendance.read",domain:"people",capability:"attendance",action:"read",mode:"read",description:"Read employee attendance"},
];
test("cross-domain business chains exist",()=>{const g=buildAvantiqoBusinessWorldGraph({capabilities:caps});assert.ok(g.chains.some(c=>c.join(">").includes("customer>customer_invoice>accounts_receivable>revenue>payment>bank>reconciliation>vat")));assert.ok(g.chains.some(c=>c.join(">").includes("supplier_invoice>inventory>recipe>dish_cost>menu_margin")));assert.equal(g.authority_effect,"NONE")});
test("capabilities bind upward to business concepts",()=>{const g=buildAvantiqoBusinessWorldGraph({capabilities:caps});assert.ok(g.edges.some(e=>e.from==="capability:finance.customer_invoices.read"&&e.to==="concept:customer_invoice"));assert.ok(g.edges.some(e=>e.relation==="VERIFIED_BY"))});
test("business concept path crosses domains",()=>{const p=businessConceptPath({from:"customer",to:"vat",capabilities:caps});assert.equal(p.found,true);assert.equal(p.path[0],"concept:customer");assert.equal(p.path.at(-1),"concept:vat")});
test("graph does not claim causal proof or authority",()=>{const g=buildAvantiqoBusinessWorldGraph({capabilities:caps});assert.equal(g.graph_edges_never_grant_authority,true);assert.equal(g.business_relations_are_navigation_and_reasoning_structure_not_causal_proof,true)});
