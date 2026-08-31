import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bootPath = "services/avantiqo-code-engine/serverless_boot.py";
const dockerPath = "services/avantiqo-code-engine/Dockerfile.runpod";

const [boot, dockerfile] = await Promise.all([
  readFile(bootPath, "utf8"),
  readFile(dockerPath, "utf8"),
]);

test("Code Blackwell FP8 disables DeepGEMM before vLLM import", () => {
  const deep = 'os.environ["VLLM_USE_DEEP_GEMM"] = "0"';
  const moe = 'os.environ["VLLM_MOE_USE_DEEP_GEMM"] = "0"';
  const handlerImport = "import handler as code_engine";
  assert.ok(boot.includes(deep), "global DeepGEMM fallback must be source locked");
  assert.ok(boot.includes(moe), "MoE DeepGEMM fallback must be source locked");
  assert.ok(boot.includes(handlerImport), "serverless boot must import the Code handler");
  assert.ok(boot.indexOf(deep) < boot.indexOf(handlerImport), "global DeepGEMM fallback must be set before handler/vLLM import");
  assert.ok(boot.indexOf(moe) < boot.indexOf(handlerImport), "MoE DeepGEMM fallback must be set before handler/vLLM import");
  assert.match(boot, /deep_gemm_disabled=os\.environ\.get\("VLLM_USE_DEEP_GEMM"\) == "0"/);
  assert.match(boot, /moe_deep_gemm_disabled=os\.environ\.get\("VLLM_MOE_USE_DEEP_GEMM"\) == "0"/);
});

test("Code worker image defaults to the same DeepGEMM fallback", () => {
  assert.match(dockerfile, /VLLM_USE_DEEP_GEMM=0/);
  assert.match(dockerfile, /VLLM_MOE_USE_DEEP_GEMM=0/);
  assert.match(dockerfile, /FROM vllm\/vllm-openai:v0\.27\.1/);
  assert.match(dockerfile, /ENTRYPOINT \["python3", "-u", "serverless_boot\.py"\]/);
});
