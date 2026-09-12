import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", "utf8");

test("direction contracts output tokens to the remaining approved money", () => {
  assert.match(source, /boundedDirectionUsage/);
  assert.match(source, /DIRECTION_BUDGET_TOKEN_SAFETY_RATIO = 0\.88/);
  assert.match(source, /maximumForCall \* DIRECTION_BUDGET_TOKEN_SAFETY_RATIO/);
  assert.match(source, /max_output_tokens: estimatedUsage\.output_tokens/);
  assert.match(source, /\[`\$\{channel\.metadataPrefix\}_budget_token_cap_applied`\]: bounded\.capped/);
});

test("direction tail fails before provider when budget cannot buy a useful response", () => {
  assert.match(source, /DIRECTION_MINIMUM_BOUNDED_OUTPUT_TOKENS = 1024/);
  assert.match(source, /CREATIVE_DIRECTION_BUDGET_TAIL_TOO_SMALL/);
  assert.match(source, /charged > state\.remaining/);
});
