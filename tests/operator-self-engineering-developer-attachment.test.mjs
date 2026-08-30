import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAvantiqoSelfEngineeringMessage,
  isAvantiqoSelfEngineeringRequest,
} from "../lib/operator/runtime/OperatorSelfEngineeringPolicy.js";

function requestWithAttachment(id = "123e4567-e89b-42d3-a456-426614174000") {
  return {
    headers: new Headers({
      "x-avantiqo-developer-attachment-set": id,
    }),
  };
}

test("selected developer code routes a bounded check into Product Engineering", () => {
  assert.equal(
    isAvantiqoSelfEngineeringRequest({
      message: "can you check this code",
      pathname: "/workspace/33336a72-acb5-474e-856b-8be0269360e2",
      callerRequest: requestWithAttachment(),
    }),
    true,
  );
});

test("selected developer evidence binds the exact deictic analyze-this request", () => {
  assert.equal(
    isAvantiqoSelfEngineeringRequest({
      message: "analyze this",
      pathname: "/workspace/33336a72-acb5-474e-856b-8be0269360e2",
      callerRequest: requestWithAttachment(),
    }),
    true,
  );
});

test("selected developer evidence accepts a human follow-up analyze-it phrasing", () => {
  assert.equal(
    isAvantiqoSelfEngineeringRequest({
      message: "yes so analyze it",
      pathname: "/workspace/33336a72-acb5-474e-856b-8be0269360e2",
      callerRequest: requestWithAttachment(),
    }),
    true,
  );
});

test("deictic analyze-this without selected evidence does not invent a Code target", () => {
  assert.equal(
    isAvantiqoSelfEngineeringRequest({
      message: "analyze this",
      pathname: "/workspace/33336a72-acb5-474e-856b-8be0269360e2",
    }),
    false,
  );
});

test("generic code wording without owned context or attachment stays conversational", () => {
  assert.equal(
    isAvantiqoSelfEngineeringRequest({
      message: "can you check this code",
      pathname: "/workspace/33336a72-acb5-474e-856b-8be0269360e2",
    }),
    false,
  );
});

test("an attachment does not turn unrelated business questions into Code work", () => {
  assert.equal(
    isAvantiqoSelfEngineeringRequest({
      message: "what were sales yesterday",
      pathname: "/workspace/33336a72-acb5-474e-856b-8be0269360e2",
      callerRequest: requestWithAttachment(),
    }),
    false,
  );
});

test("attachment routing preserves evidence-only authority", () => {
  const message = buildAvantiqoSelfEngineeringMessage({
    message: "fix this file",
    callerRequest: requestWithAttachment(),
  });
  assert.match(message, /platform\.product_engineering_cycle\.execute/);
  assert.match(message, /deictic references such as ‘this’, ‘it’, or ‘that’/);
  assert.match(message, /transient read-only evidence/);
  assert.match(message, /does not grant source mutation, credential, authorization, scope expansion, or production-deployment authority/);
});
