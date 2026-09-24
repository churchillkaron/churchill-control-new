import test from "node:test";
import assert from "node:assert/strict";

import {
  codeAIVerifierDisplay,
  codeAIVerifierKey,
  normalizeCodeAIVerifierEnvironment,
} from "../lib/code/runtime/CodeAIVerifierIdentityRuntime.js";
import {
  parseCodeAIWorkPackage,
} from "../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js";

test("verifier identity distinguishes the same command under different bounded environments", () => {
  const plain = { command: "npm", args: ["run", "build"] };
  const isolated = {
    ...plain,
    env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" },
  };
  assert.notEqual(codeAIVerifierKey(plain), codeAIVerifierKey(isolated));
  assert.match(codeAIVerifierDisplay(isolated), /^AVANTIQO_NEXT_DIST_DIR=\.next-code-verify npm run build$/);
});

test("verifier identity drops non-approved environment keys", () => {
  assert.deepEqual(
    normalizeCodeAIVerifierEnvironment({
      AVANTIQO_NEXT_DIST_DIR: ".next-code-verify",
      DATABASE_URL: "must-not-surface",
      PATH: "must-not-surface",
    }),
    { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" },
  );
});

test("work-package parser accepts only the exact isolated build environment", () => {
  const valid = JSON.stringify({
    contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
    phase: "verification",
    operations: [{
      action: "verify",
      input: {
        command: "npm",
        args: ["run", "build"],
        env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" },
      },
    }],
  });
  const parsed = parseCodeAIWorkPackage(valid, { reasoning_call: 1 });
  assert.equal(parsed.operations[0].input.env.AVANTIQO_NEXT_DIST_DIR, ".next-code-verify");

  for (const env of [
    { AVANTIQO_NEXT_DIST_DIR: ".wrong" },
    { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify", EXTRA: "1" },
    { DATABASE_URL: "secret" },
  ]) {
    const invalid = JSON.stringify({
      contract: "AVANTIQO_CODE_AI_WORK_PACKAGE_V1",
      phase: "verification",
      operations: [{
        action: "verify",
        input: { command: "npm", args: ["run", "build"], env },
      }],
    });
    assert.throws(
      () => parseCodeAIWorkPackage(invalid, { reasoning_call: 1 }),
      /CODE_AI_WORK_PACKAGE/,
    );
  }
});
