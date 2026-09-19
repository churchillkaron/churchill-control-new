import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const provider = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderV2.js", "utf8");

test("Code bypasses the Modal CPU gateway when direct Modal credentials are available", () => {
  assert.match(provider, /MODAL_DIRECT_TRANSPORT = "modal-js-sdk-function-call-v1"/);
  assert.match(provider, /MODAL_DIRECT_JOB_PREFIX = "modal-code-direct:"/);
  assert.match(provider, /provider_job_id: `\$\{MODAL_DIRECT_JOB_PREFIX\}\$\{jobId\}`/);
  assert.match(provider, /new sdk\.ModalClient/);
  assert.match(provider, /client\.functions\.fromName\(MODAL_APP_NAME, functionName/);
  assert.match(provider, /modal_gateway_used: false/);
  assert.match(provider, /if \(direct\) return executeDirectModal\(direct, input\)/);
});

test("Code retains the legacy gateway only as compatibility fallback", () => {
  assert.match(provider, /function modalConfig\(\)/);
  assert.match(provider, /return executeModal\(modal, input\)/);
  assert.match(provider, /return getModalStatus\(modal, input\)/);
});
