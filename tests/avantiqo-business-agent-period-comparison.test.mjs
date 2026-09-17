import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("business intelligence agent carries governed two-period comparison plan",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/buildBusinessPeriodComparisonPlan/);
  assert.match(source,/baseline_period_id/);
  assert.match(source,/business_period_comparison_plan/);
  assert.match(source,/AVANTIQO_BUSINESS_PERIOD_COMPARISON_PLAN_CONTRACT/);
});

test("business intelligence agent pre-executes deterministic internal evidence batch",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/executeBusinessInternalEvidenceBatch/);
  assert.match(source,/business_internal_evidence_batch: internalEvidenceBatch/);
  assert.match(source,/business_internal_comparison_results/);
  assert.match(source,/business_internal_evidence_bundle/);
});

test("business intelligence agent injects completed deterministic diagnosis",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/executeBusinessDiagnosisOrchestration/);
  assert.match(source,/business_completed_diagnosis/);
  assert.match(source,/AVANTIQO_BUSINESS_DIAGNOSIS_ORCHESTRATOR_CONTRACT/);
});

test("business intelligence agent gates external research from completed diagnosis",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/buildBusinessExternalResearchPlan/);
  assert.match(source,/business_external_research_plan/);
  assert.match(source,/external_research_required: externalResearchPlan\?\.research_allowed === true/);
  assert.match(source,/AVANTIQO_BUSINESS_EXTERNAL_RESEARCH_CONTRACT/);
});


test("business intelligence agent auto-collects external evidence only after gate",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/externalResearchPlan\?\.research_allowed === true/);
  assert.match(source,/collectBusinessExternalEvidence/);
  assert.match(source,/business_external_evidence_collection: externalEvidenceCollection/);
  assert.match(source,/business_external_evidence_packets/);
  assert.match(source,/AVANTIQO_BUSINESS_EXTERNAL_EVIDENCE_COLLECTOR_CONTRACT/);
});


test("business intelligence agent auto-assesses and closes external diagnosis before conversation",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/assessBusinessExternalEvidence/);
  assert.match(source,/externalEvidenceAssessment/);
  assert.match(source,/closeBusinessDiagnosisWithExternalEvidence/);
  assert.match(source,/business_external_diagnosis_closure: externalDiagnosisClosure/);
  assert.match(source,/business_final_diagnosis: finalDiagnosis/);
  assert.match(source,/buildBusinessAnswerBrief/);
  assert.match(source,/business_answer_brief: businessAnswerBrief/);
  assert.match(source,/AVANTIQO_BUSINESS_ANSWER_BRIEF_CONTRACT/);
  assert.match(source,/external_diagnosis_closed_before_conversation/);
  assert.match(source,/buildBusinessDiagnosisReceipt/);
  assert.match(source,/business_diagnosis_receipt: businessDiagnosisReceipt/);
  assert.match(source,/AVANTIQO_BUSINESS_DIAGNOSIS_RECEIPT_CONTRACT/);
  assert.match(source,/externalEvidenceAuditPackets/);
  assert.match(source,/externalEvidenceCollectionContext/);
  assert.match(source,/externalEvidenceAssessmentContext/);
  assert.doesNotMatch(source,/business_external_evidence_collection: externalEvidenceCollection,/);
  assert.doesNotMatch(source,/business_external_evidence_packets: externalEvidenceCollection\?\.packets/);
  assert.doesNotMatch(source,/createBusinessExternalDiagnosisClosureTool/);
});

test("business intelligence agent enforces final response against answer brief",()=>{
  const source=fs.readFileSync("lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js","utf8");
  assert.match(source,/enforceBusinessAnswerEvidenceBoundary/);
  assert.match(source,/boundedAnswer/);
  assert.match(source,/business_answer_evidence_boundary/);
  assert.match(source,/AVANTIQO_BUSINESS_ANSWER_EVIDENCE_BOUNDARY_CONTRACT/);
});
