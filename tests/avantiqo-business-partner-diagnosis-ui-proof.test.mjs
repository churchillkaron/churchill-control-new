import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("shared operator artifact surface renders persisted diagnosis proof",()=>{
  const source=fs.readFileSync("components/operator/OperatorExecutionArtifacts.jsx","utf8");
  assert.match(source,/data-avantiqo-business-diagnosis-proof/);
  assert.match(source,/Verified diagnosis/);
  assert.match(source,/receipt_fingerprint/);
  assert.match(source,/Request type/);
  assert.match(source,/diagnosis\.class/);
  assert.match(source,/periodDisplayLabel/);
  assert.match(source,/Period IDs/);
  assert.match(source,/baseline_start_date/);
  assert.match(source,/current_end_date/);
  assert.match(source,/raw reasoning is not persisted/i);
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
