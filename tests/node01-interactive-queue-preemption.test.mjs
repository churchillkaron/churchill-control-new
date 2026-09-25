import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync("scripts/local-node/avantiqo-node01-worker.ps1", "utf8");

test("interactive GPU claim loop never runs blocking background warm or learning work", () => {
  assert.doesNotMatch(worker, /\$Lane -eq 'gpu' -and \$jobs\.Count -eq 0\) \{[^}]*WarmQwenIfIdle/);
  assert.doesNotMatch(worker, /\$Lane -eq 'gpu' -and \$jobs\.Count -eq 0\) \{[^}]*RunIdleLearningEvaluation/);
  assert.match(worker, /\$Lane -eq 'training' -and \$jobs\.Count -eq 0\) \{ RunIdleLearningEvaluation \}/);
});

test("idle learning is isolated to training lane and CPU", () => {
  assert.match(worker, /function RunIdleLearningEvaluation \{\s*if \(\$Lane -ne 'training'\) \{ return \}/s);
  assert.match(worker, /\$evaluationModel='qwen3:0\.6b'/);
  assert.match(worker, /num_gpu=0/);
});

test("stale model-training locks self-heal only when no training process exists", () => {
  assert.match(worker, /function TrainingProcessActive/);
  assert.match(worker, /CommandLine -match 'local_train\\\.py'/);
  assert.match(worker, /function ClearStaleTrainingLock/);
  assert.match(worker, /if \(TrainingProcessActive\) \{ return \$false \}/);
  assert.match(worker, /Remove-Item -Force -ErrorAction Stop \$trainingLock/);
  assert.match(worker, /\[void\]\(ClearStaleTrainingLock\)[\s\S]*?if \(Test-Path \$trainingLock\) \{ return @\(\) \}/);
});


test("node registration includes every dedicated lane capability required by claim RPC", () => {
  const allMatch = worker.match(/\$AllCapabilities = @\(([^\n]+)\)/);
  assert.ok(allMatch, "AllCapabilities declaration required");
  const all = allMatch[1];
  assert.match(all, /'ai\.code\.live-conversation'/);
  assert.match(all, /'ai\.model\.train'/);
  assert.match(worker, /\$LiveCapabilities = @\('ai\.code\.live-conversation'\)/);
  assert.match(worker, /\$TrainingCapabilities = @\('ai\.model\.train'\)/);
});
