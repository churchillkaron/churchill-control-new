#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";

import {
  ensureResponsesJsonModeInput,
  responsesInputMentionsJson,
} from "../lib/platform/service-runtime/providers/openai/OpenAIResponsesJsonModeRuntime.js";

const failures = [];

function assert(label, condition) {
  if (!condition) failures.push(label);
}

const jsonObjectFormat = { type: "json_object" };
const plainTextFormat = { type: "text" };
const plainStringInput = "Summarize this conversation.";
const guardedStringInput = ensureResponsesJsonModeInput(
  plainStringInput,
  jsonObjectFormat,
);

assert(
  "JSON object string inputs receive an explicit json instruction",
  responsesInputMentionsJson(guardedStringInput),
);
assert(
  "Non-JSON string formats are unchanged",
  ensureResponsesJsonModeInput(plainStringInput, plainTextFormat) === plainStringInput,
);

const compliantStringInput = "Return one valid JSON object.";
assert(
  "Already compliant string inputs are unchanged",
  ensureResponsesJsonModeInput(compliantStringInput, jsonObjectFormat) === compliantStringInput,
);

const messageInput = [
  {
    role: "user",
    content: [{ type: "input_text", text: "Describe the image." }],
  },
];
const guardedMessageInput = ensureResponsesJsonModeInput(
  messageInput,
  jsonObjectFormat,
);
assert(
  "JSON object message inputs receive a dedicated instruction message",
  guardedMessageInput.length === 2 &&
    guardedMessageInput[0] === messageInput[0] &&
    guardedMessageInput[1]?.role === "user" &&
    responsesInputMentionsJson(guardedMessageInput[1]?.content),
);

const providerSource = fs.readFileSync(
  new URL(
    "../lib/platform/service-runtime/providers/openai/OpenAIProvider.js",
    import.meta.url,
  ),
  "utf8",
);
const operatorSource = fs.readFileSync(
  new URL("../lib/operator/runtime/OperatorReasoningRuntime.js", import.meta.url),
  "utf8",
);

assert(
  "Shared text generation applies the JSON mode compatibility guard",
  providerSource.includes(
    "ensureResponsesJsonModeInput(requestInput, format)",
  ) && providerSource.includes("input: compatibleRequestInput"),
);
assert(
  "Shared media analysis applies the JSON mode compatibility guard",
  providerSource.includes("const requestInput = ensureResponsesJsonModeInput(["),
);
assert(
  "Operator serializes an explicit JSON output contract into its model input",
  operatorSource.includes("output_contract:") &&
    operatorSource.includes('format: "json_object"') &&
    operatorSource.includes("Return exactly one valid json object"),
);

if (failures.length) {
  console.error("OPENAI_RESPONSES_JSON_MODE_AUDIT=FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("OPENAI_RESPONSES_JSON_MODE_AUDIT=PASS");
  console.log("JSON_MODE_INPUT_CONTRACT=EXPLICIT");
  console.log("JSON_MODE_GUARD_OWNER=OPENAI_PROVIDER_RUNTIME");
  console.log("OPERATOR_JSON_MODE_REQUEST=COMPATIBLE");
}
