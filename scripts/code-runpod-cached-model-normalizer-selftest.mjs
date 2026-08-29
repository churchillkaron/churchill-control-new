import assert from "node:assert/strict";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_CACHED_MODEL_NORMALIZER_SELFTEST_V1";
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const stringList = (value) => Array.isArray(value)
  ? value.map((entry) => text(entry)).filter(Boolean)
  : text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
const modelReferences = (value) => Array.isArray(value)
  ? value.map((entry) => text(entry)).filter(Boolean)
  : [];

const gpus = [
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
];
const cuda = ["12.8", "12.9", "13.0"];
const refs = ["https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8:dcaee4d4dfc5ee71ad501f01f530e5652438fde0"];

assert.deepEqual(stringList(gpus), gpus);
assert.deepEqual(stringList(cuda), cuda);
assert.deepEqual(modelReferences(refs), refs);
assert.equal(stringList(gpus)[0], "NVIDIA H100 80GB HBM3");
assert.equal(stringList(gpus)[4], "NVIDIA RTX PRO 6000 Blackwell Server Edition");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  gpu_names_preserved: true,
  cuda_versions_preserved: true,
  model_reference_preserved: true,
  runpod_mutation_performed: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
