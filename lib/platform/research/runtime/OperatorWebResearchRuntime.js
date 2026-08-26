import {
  inferOperatorResearchMode,
} from "./OperatorMechanismResearchPolicy.js";
import {
  runOperatorMechanismResearch,
} from "./OperatorMechanismResearchRuntime.js";
import {
  OPERATOR_WEB_EVIDENCE_CONTRACT,
  runOperatorWebEvidenceResearch,
} from "./OperatorWebEvidenceRuntime.js";

export const OPERATOR_WEB_RESEARCH_CONTRACT = "AVANTIQO_GOVERNED_WEB_RESEARCH_V2";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function runOperatorWebResearch({
  context = {},
  payload = {},
} = {}) {
  const mode = inferOperatorResearchMode({
    query: payload.query,
    objective: payload.objective,
    research_mode: payload.research_mode,
  });

  if (mode === "evidence") {
    const result = await runOperatorWebEvidenceResearch({ context, payload });
    return {
      ...result,
      contract: OPERATOR_WEB_RESEARCH_CONTRACT,
      evidence_contract: OPERATOR_WEB_EVIDENCE_CONTRACT,
      research_mode: mode,
      mechanism_research_contract: null,
      mechanism_synthesis: null,
      governance: {
        ...(result?.governance || {}),
        adaptive_research_mode: true,
        mechanism_escalation_performed: false,
        authorization_effect: "NONE",
      },
    };
  }

  const result = await runOperatorMechanismResearch({
    context,
    payload: {
      ...payload,
      query: text(payload.query, 4000),
      objective: text(payload.objective, 2000),
      research_mode: mode,
    },
  });

  return {
    ...result,
    contract: OPERATOR_WEB_RESEARCH_CONTRACT,
    research_mode: mode,
    governance: {
      ...(result?.governance || {}),
      adaptive_research_mode: true,
      mechanism_escalation_performed: true,
      implementation_reference_is_evidence_not_answer: true,
      authorization_effect: "NONE",
    },
  };
}

export default runOperatorWebResearch;
