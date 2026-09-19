export const CODE_AI_FRONTIER_PROMPT_CONTRACT =
  "AVANTIQO_CODE_FRONTIER_PROMPT_CONTRACT_V1";

function text(value, maximum = 6000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}

export function renderCodeAIFrontierBenchmarkPrompt({ prompt_contract, benchmark_case } = {}) {
  const contract = prompt_contract && typeof prompt_contract === "object" ? prompt_contract : {};
  const item = benchmark_case && typeof benchmark_case === "object" ? benchmark_case : {};
  if (text(contract.contract, 180) !== CODE_AI_FRONTIER_PROMPT_CONTRACT) {
    throw new Error("CODE_AI_FRONTIER_PROMPT_CONTRACT_INVALID");
  }
  const lines = list(contract.template_lines).map((line) => text(line, 4000));
  if (!lines.length) throw new Error("CODE_AI_FRONTIER_PROMPT_TEMPLATE_REQUIRED");
  const requiredEvidence = list(item.required_evidence).map((value) => text(value, 240)).filter(Boolean);
  const replacements = {
    "{{title}}": text(item.title, 1200),
    "{{category}}": text(item.category, 240),
    "{{case_id_json}}": JSON.stringify(text(item.case_id, 240)),
    "{{required_evidence_json}}": JSON.stringify(requiredEvidence),
  };
  return lines
    .map((line) => Object.entries(replacements).reduce(
      (result, [needle, value]) => result.replaceAll(needle, value),
      line,
    ))
    .join("\n");
}

export const CodeAIFrontierBenchmarkPromptRuntime = Object.freeze({
  contract: CODE_AI_FRONTIER_PROMPT_CONTRACT,
  render: renderCodeAIFrontierBenchmarkPrompt,
});

export default CodeAIFrontierBenchmarkPromptRuntime;
