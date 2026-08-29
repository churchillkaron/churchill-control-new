function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

const TOKEN_LIMIT_PATTERNS = [
  /RESPONSE_NOT_COMPLETE/i,
  /max[_ -]?output[_ -]?tokens/i,
  /FINAL_ANSWER_BUDGET_EXHAUSTED/i,
  /finish_reason=length/i,
  /maximum context length/i,
  /context length exceeded/i,
];

const OWNED_INTELLIGENCE_UNAVAILABLE_PATTERNS = [
  /No priced executable provider available for ai\.(?:text\.generate|reasoning\.execute)/i,
  /AVANTIQO_INTELLIGENCE_/i,
  /OWNED_INTELLIGENCE_/i,
  /RUNPOD_.*INTELLIGENCE/i,
];

const PROVIDER_RUNTIME_PATTERNS = [
  /\bOPENAI_[A-Z0-9_:-]+/i,
  /\bANTHROPIC_[A-Z0-9_:-]+/i,
  /\bGEMINI_[A-Z0-9_:-]+/i,
  /\bGOOGLE(?:AI)?_[A-Z0-9_:-]+/i,
  /Provider selection failed for ai\./i,
  /provider request failed/i,
  /provider temporarily unavailable/i,
  /HTTP_TIMEOUT/i,
  /REQUEST_FAILED/i,
];

function matchesAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

export function shouldSanitizeOperatorRuntimeError(error) {
  const internal = text(error?.message || error, 4000);
  if (!internal) return false;
  return (
    matchesAny(internal, TOKEN_LIMIT_PATTERNS) ||
    matchesAny(internal, OWNED_INTELLIGENCE_UNAVAILABLE_PATTERNS) ||
    matchesAny(internal, PROVIDER_RUNTIME_PATTERNS)
  );
}

export function operatorPublicError(error) {
  const internal = text(error?.message || error, 4000);

  if (matchesAny(internal, TOKEN_LIMIT_PATTERNS)) {
    return {
      code: "OPERATOR_RESPONSE_LIMIT_REACHED",
      message:
        "I couldn't complete that response within the current model limit. I didn't execute anything. Please try again with the same request and I'll continue more compactly.",
      retryable: true,
    };
  }

  if (matchesAny(internal, OWNED_INTELLIGENCE_UNAVAILABLE_PATTERNS)) {
    return {
      code: "OPERATOR_OWNED_INTELLIGENCE_UNAVAILABLE",
      message:
        "Avantiqo's owned intelligence is temporarily unavailable. I didn't use an external AI fallback and I didn't execute anything. Please try again shortly.",
      retryable: true,
    };
  }

  return {
    code: "OPERATOR_PROVIDER_UNAVAILABLE",
    message:
      "The AI runtime needed for that request is temporarily unavailable. I didn't execute anything. Please try again.",
    retryable: true,
  };
}

export function isOperatorPublicSafeMessage(value) {
  const source = text(value, 4000);
  if (!source) return false;
  return !(
    /\b(?:OPENAI|ANTHROPIC|GEMINI|RUNPOD)_[A-Z0-9_:-]+\b/.test(source) ||
    /max[_ -]?output[_ -]?tokens/i.test(source) ||
    /stack trace/i.test(source)
  );
}

export const OPERATOR_PUBLIC_ERROR_POLICY = Object.freeze({
  contract: "AVANTIQO_OPERATOR_PUBLIC_ERROR_POLICY_V1",
  raw_provider_errors_exposed: false,
  raw_runtime_errors_exposed: false,
  execution_claim_on_error: false,
});
