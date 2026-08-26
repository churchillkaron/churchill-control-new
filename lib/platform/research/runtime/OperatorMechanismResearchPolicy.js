export const OPERATOR_MECHANISM_RESEARCH_POLICY_CONTRACT =
  "AVANTIQO_MECHANISM_FIRST_RESEARCH_POLICY_V1";

const MODES = new Set(["evidence", "mechanism", "invention"]);

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function requestedMode(value) {
  const mode = text(value, 40).toLowerCase();
  return MODES.has(mode) ? mode : null;
}

export function inferOperatorResearchMode({
  query,
  objective,
  research_mode,
} = {}) {
  const explicit = requestedMode(research_mode);
  if (explicit) return explicit;

  const source = `${text(query, 4000)} ${text(objective, 2000)}`.toLowerCase();
  const inventionSignal = /\b(novel|new approach|not been done|never been done|nobody has|no one has|unsolved|impossible|invent|breakthrough|first[- ]principles|fundamental limit|new architecture|new algorithm)\b/.test(source);
  if (inventionSignal) return "invention";

  const mechanismSignal = /\b(build|implement|design|engineer|architecture|algorithm|optimi[sz]e|performance|latency|throughput|scalability|how .* works?|why .* works?|mechanism|protocol|database|compiler|runtime|gpu|kernel|model|inference|distributed|system|code|software|hardware|api|network|storage|memory)\b/.test(source);
  return mechanismSignal ? "mechanism" : "evidence";
}

export function operatorResearchRequirements(mode) {
  const normalized = requestedMode(mode) || "evidence";
  if (normalized === "invention") {
    return Object.freeze({
      mode: normalized,
      minimum_problem_decomposition: 2,
      minimum_mechanisms: 2,
      minimum_constraints: 2,
      minimum_hypotheses: 3,
      minimum_experiments: 2,
      minimum_analogies: 1,
      minimum_solution_directions: 2,
      implementation_reference_may_be_primary_answer: false,
    });
  }
  if (normalized === "mechanism") {
    return Object.freeze({
      mode: normalized,
      minimum_problem_decomposition: 2,
      minimum_mechanisms: 2,
      minimum_constraints: 1,
      minimum_hypotheses: 2,
      minimum_experiments: 1,
      minimum_analogies: 0,
      minimum_solution_directions: 1,
      implementation_reference_may_be_primary_answer: false,
    });
  }
  return Object.freeze({
    mode: normalized,
    minimum_problem_decomposition: 0,
    minimum_mechanisms: 0,
    minimum_constraints: 0,
    minimum_hypotheses: 0,
    minimum_experiments: 0,
    minimum_analogies: 0,
    minimum_solution_directions: 0,
    implementation_reference_may_be_primary_answer: true,
  });
}

function normalizedTextItems(value, maximum = 12) {
  return list(value)
    .map((item) => text(typeof item === "string" ? item : item?.text || item?.statement, 2000))
    .filter(Boolean)
    .slice(0, maximum);
}

export function assessOperatorResearchSynthesis({
  mode,
  synthesis = {},
} = {}) {
  const requirements = operatorResearchRequirements(mode);
  const source = object(synthesis);
  const counts = {
    problem_decomposition: normalizedTextItems(source.problem_decomposition).length,
    mechanisms: list(source.mechanisms).length,
    constraints: list(source.constraints).length,
    hypotheses: list(source.hypotheses).length,
    experiments: list(source.experiments).length,
    analogies: list(source.analogies).length,
    solution_directions: list(source.solution_directions).length,
  };
  const blockers = [];

  for (const [key, minimum] of [
    ["problem_decomposition", requirements.minimum_problem_decomposition],
    ["mechanisms", requirements.minimum_mechanisms],
    ["constraints", requirements.minimum_constraints],
    ["hypotheses", requirements.minimum_hypotheses],
    ["experiments", requirements.minimum_experiments],
    ["analogies", requirements.minimum_analogies],
    ["solution_directions", requirements.minimum_solution_directions],
  ]) {
    if (counts[key] < minimum) {
      blockers.push(
        `RESEARCH_${key.toUpperCase()}_INSUFFICIENT:${counts[key]}:${minimum}`,
      );
    }
  }

  return {
    contract: OPERATOR_MECHANISM_RESEARCH_POLICY_CONTRACT,
    mode: requirements.mode,
    verified: blockers.length === 0,
    counts,
    requirements,
    blockers,
    principles: {
      mechanism_before_imitation: true,
      implementation_reference_is_evidence_not_answer:
        requirements.implementation_reference_may_be_primary_answer === false,
      failed_approach_does_not_prove_objective_impossible: true,
      hypotheses_must_be_falsifiable: requirements.mode !== "evidence",
      experiments_should_discriminate_between_hypotheses: requirements.mode !== "evidence",
      adjacent_domain_transfer_encouraged: requirements.mode === "invention",
      raw_chain_of_thought_required: false,
    },
  };
}

export const OperatorMechanismResearchPolicy = Object.freeze({
  contract: OPERATOR_MECHANISM_RESEARCH_POLICY_CONTRACT,
  modes: [...MODES],
  inferMode: inferOperatorResearchMode,
  requirements: operatorResearchRequirements,
  assess: assessOperatorResearchSynthesis,
});
