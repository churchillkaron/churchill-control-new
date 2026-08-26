import {
  assessOperatorResearchSynthesis,
  inferOperatorResearchMode,
} from "../lib/platform/research/runtime/OperatorMechanismResearchPolicy.js";

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

assert(
  inferOperatorResearchMode({ query: "What is the current VAT rate?" }) === "evidence",
  "MECHANISM_RESEARCH_SELFTEST_FACT_MODE_FAILED",
);
assert(
  inferOperatorResearchMode({ query: "How should we build a distributed storage engine?" }) === "mechanism",
  "MECHANISM_RESEARCH_SELFTEST_MECHANISM_MODE_FAILED",
);
assert(
  inferOperatorResearchMode({ query: "Nobody has built this before; invent a new architecture" }) === "invention",
  "MECHANISM_RESEARCH_SELFTEST_INVENTION_MODE_FAILED",
);

const shallow = assessOperatorResearchSynthesis({
  mode: "invention",
  synthesis: {
    problem_decomposition: ["one part"],
    mechanisms: [{ name: "known implementation" }],
    constraints: [],
    hypotheses: [{ hypothesis: "copy existing code" }],
    experiments: [],
    analogies: [],
    solution_directions: [{ direction: "copy existing implementation" }],
  },
});
assert(shallow.verified === false, "MECHANISM_RESEARCH_SELFTEST_SHALLOW_RESEARCH_ACCEPTED");
assert(
  shallow.blockers.some((item) => item.startsWith("RESEARCH_HYPOTHESES_INSUFFICIENT")),
  "MECHANISM_RESEARCH_SELFTEST_HYPOTHESIS_GATE_MISSING",
);
assert(
  shallow.blockers.some((item) => item.startsWith("RESEARCH_EXPERIMENTS_INSUFFICIENT")),
  "MECHANISM_RESEARCH_SELFTEST_EXPERIMENT_GATE_MISSING",
);
assert(
  shallow.blockers.some((item) => item.startsWith("RESEARCH_ANALOGIES_INSUFFICIENT")),
  "MECHANISM_RESEARCH_SELFTEST_ANALOGY_GATE_MISSING",
);

const deep = assessOperatorResearchSynthesis({
  mode: "invention",
  synthesis: {
    problem_decomposition: ["latency source", "consistency requirement"],
    mechanisms: [
      { name: "locality" },
      { name: "precomputation" },
    ],
    constraints: [
      { constraint: "network propagation" },
      { constraint: "memory budget" },
    ],
    hypotheses: [
      { hypothesis: "move compute to data" },
      { hypothesis: "precompute likely results" },
      { hypothesis: "change consistency boundary" },
    ],
    experiments: [
      { experiment: "latency microbenchmark" },
      { experiment: "consistency/load prototype" },
    ],
    analogies: [
      { domain: "processor cache design" },
    ],
    solution_directions: [
      { direction: "local precomputed state" },
      { direction: "hierarchical consistency model" },
    ],
  },
});
assert(deep.verified === true, "MECHANISM_RESEARCH_SELFTEST_DEEP_RESEARCH_REJECTED");
assert(
  deep.principles.implementation_reference_is_evidence_not_answer === true,
  "MECHANISM_RESEARCH_SELFTEST_COPY_GUARD_MISSING",
);
assert(
  deep.principles.failed_approach_does_not_prove_objective_impossible === true,
  "MECHANISM_RESEARCH_SELFTEST_UNSOLVED_PRINCIPLE_MISSING",
);

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_MECHANISM_FIRST_RESEARCH_SELFTEST_V1",
  cases: {
    factual_mode_stays_evidence: true,
    technical_mode_escalates_to_mechanism: true,
    novel_mode_escalates_to_invention: true,
    shallow_code_copy_research_rejected: true,
    invention_requires_competing_hypotheses: true,
    invention_requires_experiments: true,
    invention_requires_adjacent_domain_transfer: true,
    deep_mechanism_synthesis_passes: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
console.log("AVANTIQO_MECHANISM_FIRST_RESEARCH_SELFTEST_V1=PASS");