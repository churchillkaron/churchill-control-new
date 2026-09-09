import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "utf8",
);

test("temporal direction unwraps canonical raw execution envelopes", () => {
  assert.match(source, /\["output", "result", "data", "response", "raw"\]/);
});

test("live compatibility envelope shape remains discoverable", () => {
  const live = {
    output: {
      url: null,
      provider_job_id: "modal-intelligence-direct:test",
      status: "completed",
      raw: {
        status: "completed",
        output: {
          text: JSON.stringify({ workflow_kind: "TEMPORAL", scenes: [] }),
        },
      },
    },
  };
  const queue = [{ value: live, depth: 0 }];
  let text = null;
  while (queue.length) {
    const { value, depth } = queue.shift();
    if (depth > 12 || !value) continue;
    if (typeof value === "object" && typeof value.text === "string") {
      text = value.text;
      break;
    }
    if (typeof value === "object") {
      for (const key of ["output", "result", "data", "response", "raw"]) {
        if (value[key] != null) queue.push({ value: value[key], depth: depth + 1 });
      }
    }
  }
  assert.deepEqual(JSON.parse(text), { workflow_kind: "TEMPORAL", scenes: [] });
});
