export const CODE_AI_ZERO_IDLE_POLICY_CONTRACT =
  "AVANTIQO_CODE_ZERO_IDLE_POLICY_V1";

function text(value, maximum = 120) {
  return String(value ?? "").trim().slice(0, maximum);
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function disabled(value) {
  return ["0", "false", "no", "off"].includes(text(value).toLowerCase());
}

export function codeAIZeroIdleServerlessEnabled() {
  const configured = process.env.AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED;
  if (enabled(configured)) return true;
  if (disabled(configured)) return false;
  return text(process.env.VERCEL_ENV).toLowerCase() === "production";
}

export const CodeAIZeroIdlePolicyRuntime = Object.freeze({
  contract: CODE_AI_ZERO_IDLE_POLICY_CONTRACT,
  production_default: true,
  enabled: codeAIZeroIdleServerlessEnabled,
});

export default CodeAIZeroIdlePolicyRuntime;
