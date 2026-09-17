import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const migration=fs.readFileSync("supabase/migrations/20260917103500_node01_learning_evaluation_receipts.sql","utf8");
const worker=fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1","utf8");
test("learning receipts are durable, private, and non-promotable",()=>{
  assert.match(migration,/create table if not exists public\.avantiqo_local_learning_evaluations/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on table public\.avantiqo_local_learning_evaluations from anon, authenticated/);
  assert.match(migration,/unique \(agenda_id, agenda_updated_at, contract\)/);
  assert.match(migration,/AVANTIQO_LOCAL_NODE_UNAUTHORIZED/);
  assert.match(migration,/AVANTIQO_LOCAL_LEARNING_AGENDA_REVISION_INVALID/);
  assert.match(migration,/promotion_authorized/); assert.match(migration,/mutation_authority/);
  assert.match(migration,/fresh_evidence_required/); assert.match(migration,/independent_verification_required/);
});
test("candidate feed skips already evaluated agenda revisions",()=>{
  assert.match(migration,/not exists[\s\S]*avantiqo_local_learning_evaluations/);
  assert.match(migration,/e\.agenda_updated_at=m\.updated_at/);
  assert.doesNotMatch(migration,/'content',v_row\.content/);
});
test("worker claims real work before idle learning and records durable receipt",()=>{
  assert.match(worker,/\$jobs = ClaimJobs[\s\S]*?if \(\$Lane -eq 'gpu' -and \$jobs\.Count -eq 0\) \{ RunIdleLearningEvaluation/);
  assert.match(worker,/record_avantiqo_local_learning_evaluation/);
  assert.match(worker,/AVANTIQO_LOCAL_LEARNING_RECEIPT_NOT_RECORDED/);
});
