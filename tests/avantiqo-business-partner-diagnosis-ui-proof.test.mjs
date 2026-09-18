import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("shared operator artifact surface renders persisted diagnosis proof",()=>{
  const source=fs.readFileSync("components/operator/OperatorExecutionArtifacts.jsx","utf8");
  assert.match(source,/data-avantiqo-business-diagnosis-proof/);
  assert.match(source,/Verified diagnosis/);
  assert.match(source,/Diagnosis proof/);
  assert.match(source,/diagnosisProofHeading/);
  assert.match(source,/auditStatus === "VERIFIED" \|\| auditStatus === "VERIFIED_LEGACY"/);
  assert.match(source,/\{proofHeading\}/);
  assert.match(source,/receipt_fingerprint/);
  assert.match(source,/Request type/);
  assert.match(source,/diagnosis\.class/);
  assert.match(source,/periodDisplayLabel/);
  assert.match(source,/Period IDs/);
  assert.match(source,/Persisted proof/);
  assert.match(source,/Verified live or after reload/);
  assert.match(source,/Integrity mismatch/);
  assert.match(source,/Unsupported proof version/);
  assert.match(source,/auditStatus === "UNSUPPORTED_VERSION"/);
  assert.match(source,/Legacy proof · checksum unavailable/);
  assert.match(source,/Verified legacy proof/);
  assert.match(source,/persistedProofLabel/);
  assert.match(source,/auditStatus === "NOT_AVAILABLE"/);
  assert.match(source,/Explained from internal business data/);
  assert.match(source,/Why performance changed/);
  assert.match(source,/Answer matched the verified evidence/);
  assert.match(source,/Some of the change remains unexplained/);
  assert.match(source,/External evidence/);
  assert.match(source,/Business timezone/);
  assert.match(source,/diagnosis\.business_timezone/);
  assert.match(source,/No validated external evidence/);
  assert.match(source,/validatedExternalCount/);
  assert.match(source,/unresolvedExternalCount/);
  assert.match(source,/font-mono text-\[8px\]/);
  assert.match(source,/baseline_start_date/);
  assert.match(source,/current_end_date/);
  assert.match(source,/raw reasoning is not stored/i);
  assert.match(source,/if \(!artifacts\.length\) return diagnosisProof/);
});

test("both live operator surfaces attach diagnosis audit to message evidence",()=>{
  for(const file of ["components/operator/HomeAvantiqoIntelligence.jsx","components/operator/AvantiqoOperator.jsx"]){
    const source=fs.readFileSync(file,"utf8");
    assert.match(source,/business_diagnosis: result\.business_diagnosis/);
    assert.match(source,/evidence: turn\?\.evidence \|\| \{\}/);
    assert.match(source,/OperatorExecutionArtifacts/);
  }
});


test("both operator clients preserve and surface diagnosis proof-integrity failures",()=>{
  for(const file of ["components/operator/HomeAvantiqoIntelligence.jsx","components/operator/AvantiqoOperator.jsx"]){
    const source=fs.readFileSync(file,"utf8");
    assert.match(source,/BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE/);
    assert.match(source,/operatorRequestError\(result/);
    assert.match(source,/result\?\.details\?\.code/);
    assert.match(source,/result\?\.details\?\.stage/);
    assert.match(source,/its proof could not be verified/);
    assert.match(source,/No action was executed/);
  }
});


test("live operator transport preserves diagnosis proof-integrity status in progress events",()=>{
  const source=fs.readFileSync("app/api/operator/turn/live/route.js","utf8");
  assert.match(source,/BUSINESS_DIAGNOSIS_PROOF_INTEGRITY_FAILURE/);
  assert.match(source,/DIAGNOSIS_PROOF_INTEGRITY_FAILED/);
  assert.match(source,/integrity_code:/);
  assert.match(source,/integrity_stage:/);
  assert.match(source,/authority_effect:/);
  assert.match(source,/return response/);
});
