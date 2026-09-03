import { shouldUseOwnedFastFirst } from "../lib/operator/runtime/OperatorFastFirstPolicy.js";
import { needsOwnedCognitiveBrief } from "../lib/operator/runtime/OperatorOwnedCognitiveBriefPolicy.js";

const CONTRACT = "AVANTIQO_OPERATOR_FAST_FIRST_ROUTING_V1";

function assert(value, code) {
  if (!value) throw new Error(`${CONTRACT}_${code}`);
}

function decision({ message, source = "text", agreementState = {} }) {
  const deepRequired = needsOwnedCognitiveBrief({ source, message });
  return {
    deepRequired,
    fastFirst: shouldUseOwnedFastFirst({
      source,
      message,
      deepRequired,
      agreementState,
    }),
  };
}

const certificationPrompts = [
  "State one concise benefit of fail-closed owned AI routing.",
  "Condense that to ten words.",
];

for (const [index, message] of certificationPrompts.entries()) {
  const route = decision({ message });
  assert(route.deepRequired === false, `CERT_PROMPT_${index + 1}_UNEXPECTED_DEEP`);
  assert(route.fastFirst === true, `CERT_PROMPT_${index + 1}_NOT_FAST_FIRST`);
}

const mustNotFastFirst = [
  {
    label: "EXPLICIT_DEEP",
    message: "Analyze deeply the architecture tradeoffs.",
  },
  {
    label: "BUSINESS_ACTION",
    message: "Check the finance report.",
  },
  {
    label: "PROJECT_CONTROL",
    message: "continue",
  },
  {
    label: "ACTIVE_PENDING",
    message: certificationPrompts[0],
    agreementState: {
      pending_execution: {
        capability_key: "finance.invoice.create",
      },
    },
  },
  {
    label: "VOICE",
    source: "voice",
    message: certificationPrompts[0],
  },
];

for (const test of mustNotFastFirst) {
  const route = decision(test);
  assert(route.fastFirst === false, `${test.label}_INCORRECTLY_FAST_FIRST`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  certification_prompts_fast_first: true,
  guard_cases_fast_first: false,
  gpu_inference_performed: false,
  paid_inference_submitted: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
