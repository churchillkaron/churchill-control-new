import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function runCertification() {
  return spawnSync(
    process.execPath,
    [
      "--experimental-default-type=module",
      "--loader",
      "./scripts/next-alias-loader.mjs",
      "scripts/creative-design-engine-certification.mjs",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: process.env,
      timeout: 120000,
    },
  );
}

test("Creative Design engine certifies compose-bind-render-repair flow", () => {
  const result = runCertification();
  assert.equal(
    result.status,
    0,
    `Creative design certification failed.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );
  assert.match(result.stdout, /"passed": true/);
  assert.match(result.stdout, /"final_quality_status": "PASSED"/);
  assert.match(result.stdout, /"provider_called": false/);
  assert.match(result.stdout, /"business_truth_preserved": true/);
  assert.match(result.stdout, /"locked_nodes_preserved": true/);
});
