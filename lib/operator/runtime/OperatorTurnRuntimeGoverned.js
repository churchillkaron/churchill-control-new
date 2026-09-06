import {
  agreementWithOperatorRecommendation,
  agreementWithOperatorRecommendationProposal,
  clearOperatorRecommendation,
  operatorRecommendationFromAgreementState,
  operatorRecommendationIsProposal,
  operatorRecommendationMatchesPendingExecution,
} from "@/lib/operator/contracts/OperatorRecommendationState";
import {
  classifyPendingOperatorReply,
} from "./OperatorHumanDecisionClassifier.js";
import {
  agreementWithRecommendationRefinementMaterialized,
  classifyRecommendationRefinementAdvanceRequest,
  classifyRecommendationRefinementMaterializationRequest,
  classifyRecommendationRefinementReply,
  isRecommendationRefinementStatusMessage,
  recommendationRefinementProposalFromAgreementState,
} from "./OperatorRecommendationRefinement.js";
import {
  agreementWithRecommendationRefinementPreparation,
  clearRecommendationRefinementPreparation,
  continueSelectedRefinementPreparationFromMessage,
  prepareSelectedRefinementForGovernedBinding,
  recommendationRefinementPreparationFromAgreementState,
} from "./OperatorRecommendationRefinementPreparationBridge.js";
import {
  listOperatorCapabilities,
} from "./OperatorCapabilityCatalog";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clarificationQuestion(result) {
  return (
    text(result?.clarification?.question, 1200) ||
    (text(result?.stage, 120) === "CAPABILITY_CLARIFICATION_REQUIRED"
      ? "Which exact registered action should this selected direction become?"
      : "Please provide the exact required details for this selected action.")
  );
}

function governedRefinementResponse({
  options,
  proposal,
  result,
  agreementState,
  ready = false,
  boundRecommendation = null,
  bindingFailed = false,
}) {
  const stage = text(result?.stage, 160) || null;
  const question = bindingFailed
    ? "The prepared action could not be proven against the exact pending execution and autonomous-run binding, so I discarded it. Ask me to prepare the selected direction again from current state."
    : result?.clear_preparation === true
      ? text(result?.clarification?.question, 1200) ||
        "The saved refinement preparation is no longer valid against current authority or state. I cleared it. Ask me to prepare the selected direction again from current state."
      : clarificationQuestion(result);
  const responseText = ready && boundRecommendation
    ? `Prepared. The selected direction is now a fresh exact governed recommendation for ${text(boundRecommendation.description, 700)}. I did not reuse the old payload, and nothing executed. Say “do it” when you want me to execute this exact newly bound action.`
    : bindingFailed
      ? "I stopped before creating a usable pending action because the freshly prepared refinement did not bind to the exact governed recommendation contract. The selected direction is preserved, but nothing executed."
      : result?.clear_preparation === true
        ? "The action, authority, or saved preparation state changed while we were preparing this refinement, so I discarded the stale preparation state. The selected direction is preserved, but no new pending action or run was created."
        : question;
  const clarificationRequired = !ready;

  return {
    success: true,
    decision: {
      response_text: responseText.slice(0, 1200),
      response_language: text(options.locale, 80) || null,
      intent: clarificationRequired ? "clarify" : "plan",
      confidence: 1,
      agreement_state: agreementState,
      project_state: object(options.projectState),
      clarification: clarificationRequired
        ? {
            required: true,
            question,
            options: [],
          }
        : { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: agreementState,
    current_screen: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "recommendation-refinement-governed-runtime-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      recommendation_refinement_materialization: true,
      refinement_preparation_stage: stage,
      materialization_ready: ready,
      materialized_capability_key:
        text(boundRecommendation?.capability_key, 240) || null,
      capability_freshly_validated: ready,
      old_payload_reused: false,
      missing_inputs_guessed: false,
      pending_execution_created: ready,
      autonomous_run_created: ready,
      execution_authorized: false,
      binding_failed_closed: bindingFailed,
      stale_preparation_cleared: result?.clear_preparation === true,
    },
  };
}

function bindPreparedRefinement(options, proposal, result) {
  const recommendation = object(result?.recommendation);
  const capabilityKey = text(recommendation.capability_key, 240);
  if (
    result?.ready_for_governed_binding !== true ||
    !capabilityKey ||
    result?.authorization_effect !== "NONE" ||
    result?.execution_authorized !== false ||
    result?.recommendation_binding_created !== false ||
    result?.pending_execution_created !== false ||
    result?.autonomous_run_created !== false ||
    result?.old_payload_reused !== false
  ) {
    return null;
  }

  const baseAgreement = clearRecommendationRefinementPreparation(
    options.agreementState,
  );
  const withRecommendation = agreementWithOperatorRecommendation(
    baseAgreement,
    recommendation,
    {
      objective:
        text(proposal?.proposal_text, 1200) ||
        text(recommendation.objective, 1200) ||
        text(recommendation.description, 1200),
    },
  );
  const boundRecommendation = operatorRecommendationFromAgreementState(
    withRecommendation,
  );
  if (
    !boundRecommendation ||
    text(boundRecommendation.capability_key, 240) !== capabilityKey ||
    !operatorRecommendationMatchesPendingExecution(
      withRecommendation,
      boundRecommendation,
    )
  ) {
    return null;
  }

  return {
    recommendation: boundRecommendation,
    agreement_state: agreementWithRecommendationRefinementMaterialized(
      withRecommendation,
      boundRecommendation,
    ),
  };
}

function sameRecommendation(left, right) {
  const leftId = text(left?.recommendation_id, 160);
  const rightId = text(right?.recommendation_id, 160);
  if (leftId && rightId) return leftId === rightId;
  return Boolean(
    text(left?.capability_key, 240) &&
      text(left?.capability_key, 240) === text(right?.capability_key, 240) &&
      JSON.stringify(object(left?.payload)) === JSON.stringify(object(right?.payload)),
  );
}

function recommendationProposalResponse(value) {
  let clean = text(value, 4000);
  clean = clean
    .replace(
      /\s*If you want me to execute that exact action, say [“"]do it[”"]\.\s*$/i,
      "",
    )
    .replace(
      /\s*Say [“"]next[”"], [“"]continue[”"], or [“"]do it[”"] when you want me to run (?:that next engineering cycle|it)\.\s*$/i,
      "",
    )
    .trim();
  const boundary =
    "This is a recommendation only. Say “yes” or “do it” once to select it. I will still wait for a separate later “do it” before any governed execution.";
  return `${clean ? `${clean} ` : ""}${boundary}`.slice(0, 4000);
}

function normalizeFreshRecommendationOffer(options, result) {
  const resultAgreement = object(
    result?.agreement_state || result?.decision?.agreement_state,
  );
  const offered = operatorRecommendationFromAgreementState(resultAgreement);
  if (
    !offered ||
    !operatorRecommendationMatchesPendingExecution(resultAgreement, offered)
  ) {
    return result;
  }

  const previous = operatorRecommendationFromAgreementState(
    options.agreementState,
  );
  if (previous && sameRecommendation(previous, offered)) {
    return result;
  }

  const proposedAgreement = agreementWithOperatorRecommendationProposal(
    resultAgreement,
    offered,
  );
  const proposed = operatorRecommendationFromAgreementState(proposedAgreement);
  if (
    !proposed ||
    !operatorRecommendationIsProposal(proposedAgreement, proposed) ||
    text(proposedAgreement.pending_execution?.capability_key, 240) ||
    text(proposedAgreement.autonomous_run?.run_id, 240)
  ) {
    return {
      ...object(result),
      agreement_state: clearOperatorRecommendation(resultAgreement),
      decision: {
        ...object(result?.decision),
        response_text:
          "I identified a recommendation, but I could not prove a clean proposal-only authorization state. I discarded its execution binding and did not execute anything.",
        agreement_state: clearOperatorRecommendation(resultAgreement),
        execution: { capability_key: null, payload: {}, reason: null },
      },
      execution: result?.execution || null,
      operator_catalog: {
        ...object(result?.operator_catalog),
        recommendation_proposal_fail_closed: true,
        recommendation_proposed: false,
        pending_execution_created: false,
        autonomous_run_created: false,
        execution_authorized: false,
      },
    };
  }

  return {
    ...object(result),
    agreement_state: proposedAgreement,
    decision: {
      ...object(result?.decision),
      response_text: recommendationProposalResponse(
        result?.decision?.response_text,
      ),
      agreement_state: proposedAgreement,
      execution: { capability_key: null, payload: {}, reason: null },
    },
    operator_catalog: {
      ...object(result?.operator_catalog),
      recommendation_proposed: true,
      recommendation_selected: false,
      recommendation_selection_state: "PROPOSED",
      recommendation_authorization_effect: "NONE",
      pending_execution_created: false,
      autonomous_run_created: false,
      execution_authorized: false,
      separate_selection_required: true,
      separate_execution_instruction_required: true,
    },
  };
}

function projectStateWithRecommendationSelection(
  projectState,
  recommendation,
  outcome,
) {
  const current = object(projectState);
  const decisions = list(current.decisions)
    .map((item) => text(item, 500))
    .filter(Boolean);
  const description = text(recommendation?.description, 430) ||
    "the recommended action";
  const decision = outcome === "reject"
    ? `Do not proceed with ${description}`.slice(0, 500)
    : `Proceed with ${description}`.slice(0, 500);
  const duplicate = decisions.some(
    (item) => item.toLowerCase() === decision.toLowerCase(),
  );
  return {
    ...current,
    decisions: duplicate ? decisions.slice(-10) : [...decisions.slice(-9), decision],
  };
}

function recommendationProposalDecisionClass(options, recommendation) {
  if (
    !operatorRecommendationIsProposal(
      options.agreementState,
      recommendation,
    )
  ) {
    return null;
  }
  const reply = classifyPendingOperatorReply({
    message: options.message,
    pending: true,
    recommendation: true,
  });
  if (reply === "reject") return "reject";
  if (reply === "agree" || reply === "execute") return "select";
  return null;
}

function recommendationProposalDecisionTurn(options, recommendation, decision) {
  if (decision === "reject") {
    const nextAgreementState = clearOperatorRecommendation(
      options.agreementState,
    );
    const nextProjectState = projectStateWithRecommendationSelection(
      options.projectState,
      recommendation,
      "reject",
    );
    return {
      success: true,
      decision: {
        response_text:
          "Understood. I rejected that recommendation. It created no pending execution, no autonomous run, and nothing was executed.",
        response_language: text(options.locale, 80) || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: nextProjectState,
        clarification: { required: false, question: null, options: [] },
        navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null },
        plan: [],
      },
      agreement_state: nextAgreementState,
      current_screen: null,
      provider_evidence: {
        provider: "avantiqo-local",
        model: "recommendation-selection-governed-v1",
        usage_id: null,
      },
      navigation: null,
      execution: null,
      operator_catalog: {
        recommendation_proposal_rejected: true,
        recommendation_selected: false,
        pending_execution_created: false,
        autonomous_run_created: false,
        execution_authorized: false,
      },
    };
  }

  const nextAgreementState = agreementWithOperatorRecommendation(
    options.agreementState,
    recommendation,
    {
      objective:
        text(options.projectState?.objective, 1200) ||
        text(recommendation?.objective, 1200) ||
        text(recommendation?.description, 1200),
    },
  );
  const boundRecommendation = operatorRecommendationFromAgreementState(
    nextAgreementState,
  );
  if (
    !boundRecommendation ||
    !operatorRecommendationMatchesPendingExecution(
      nextAgreementState,
      boundRecommendation,
    )
  ) {
    const safeAgreement = agreementWithOperatorRecommendationProposal(
      clearOperatorRecommendation(nextAgreementState),
      recommendation,
    );
    return {
      success: true,
      decision: {
        response_text:
          "I accepted your selection, but I could not prove the exact governed pending binding. I kept it as a proposal only and executed nothing.",
        response_language: text(options.locale, 80) || null,
        intent: "clarify",
        confidence: 1,
        agreement_state: safeAgreement,
        project_state: object(options.projectState),
        clarification: {
          required: true,
          question: "Please restate the exact action you want me to prepare.",
          options: [],
        },
        navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null },
        plan: [],
      },
      agreement_state: safeAgreement,
      current_screen: null,
      provider_evidence: {
        provider: "avantiqo-local",
        model: "recommendation-selection-governed-v1",
        usage_id: null,
      },
      navigation: null,
      execution: null,
      operator_catalog: {
        recommendation_selection_binding_failed_closed: true,
        recommendation_selected: false,
        pending_execution_created: false,
        autonomous_run_created: false,
        execution_authorized: false,
      },
    };
  }

  const nextProjectState = projectStateWithRecommendationSelection(
    options.projectState,
    boundRecommendation,
    "select",
  );
  return {
    success: true,
    decision: {
      response_text:
        "Selected. I created the exact governed pending binding for that recommendation, but I executed nothing. Say “do it” again when you want me to authorize the separate execution turn.",
      response_language: text(options.locale, 80) || null,
      intent: "plan",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: nextProjectState,
      clarification: { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: nextAgreementState,
    current_screen: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "recommendation-selection-governed-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      recommendation_proposed: false,
      recommendation_selected: true,
      recommendation_selection_state: "SELECTED",
      pending_execution_created: true,
      autonomous_run_created: true,
      execution_authorized: false,
      separate_execution_instruction_required: true,
      mutation_executed: false,
    },
  };
}

export async function runGovernedRecommendationRefinementTurn({
  options = {},
  proposal = null,
  preparation = null,
  capabilities = [],
  continuation = false,
} = {}) {
  const result = continuation
    ? continueSelectedRefinementPreparationFromMessage({
        proposal,
        preparation,
        capabilities,
        message: options.message,
        context: options,
        permissions: options.permissions,
        role: options.role,
      })
    : prepareSelectedRefinementForGovernedBinding({
        proposal,
        capabilities,
        context: options,
        permissions: options.permissions,
        role: options.role,
      });

  if (result?.ready_for_governed_binding === true) {
    const bound = bindPreparedRefinement(options, proposal, result);
    if (bound) {
      return governedRefinementResponse({
        options,
        proposal,
        result,
        agreementState: bound.agreement_state,
        ready: true,
        boundRecommendation: bound.recommendation,
      });
    }

    const cleared = clearRecommendationRefinementPreparation(
      options.agreementState,
    );
    return governedRefinementResponse({
      options,
      proposal,
      result,
      agreementState: cleared,
      bindingFailed: true,
    });
  }

  const nextAgreementState = result?.clear_preparation === true
    ? clearRecommendationRefinementPreparation(options.agreementState)
    : agreementWithRecommendationRefinementPreparation(
        options.agreementState,
        result,
        proposal,
      );

  return governedRefinementResponse({
    options,
    proposal,
    result,
    agreementState: nextAgreementState,
  });
}

async function legacyRunOperatorTurn(options) {
  const legacy = await import("./OperatorTurnRuntimeLegacy.js");
  const result = await legacy.runOperatorTurn(options);
  return normalizeFreshRecommendationOffer(options, result);
}

export async function runOperatorTurn(options = {}) {
  const proposal = recommendationRefinementProposalFromAgreementState(
    options.agreementState,
  );
  if (!proposal) {
    const recommendation = operatorRecommendationFromAgreementState(
      options.agreementState,
    );
    const proposalDecision = recommendation
      ? recommendationProposalDecisionClass(options, recommendation)
      : null;
    if (recommendation && proposalDecision) {
      return recommendationProposalDecisionTurn(
        options,
        recommendation,
        proposalDecision,
      );
    }
    return legacyRunOperatorTurn(options);
  }

  const rawAgreementState = object(options.agreementState);
  const rawPreparationPresent = Object.prototype.hasOwnProperty.call(
    rawAgreementState,
    "recommendation_refinement_preparation",
  );
  const preparation = recommendationRefinementPreparationFromAgreementState(
    options.agreementState,
    proposal,
  );
  if (rawPreparationPresent && !preparation) {
    const result = {
      stage: "INVALID_REFINEMENT_PREPARATION_STATE",
      clear_preparation: true,
      ready_for_governed_binding: false,
      authorization_effect: "NONE",
      execution_authorized: false,
      recommendation_binding_created: false,
      pending_execution_created: false,
      autonomous_run_created: false,
      old_payload_reused: false,
      clarification: {
        required: true,
        question:
          "The saved refinement preparation no longer proves an authority-free state. I cleared it. Ask me to prepare the selected direction again from current state.",
      },
    };
    return governedRefinementResponse({
      options,
      proposal,
      result,
      agreementState: clearRecommendationRefinementPreparation(
        options.agreementState,
      ),
    });
  }

  if (isRecommendationRefinementStatusMessage(options.message)) {
    return legacyRunOperatorTurn(options);
  }

  if (preparation) {
    const refinementDecision = classifyRecommendationRefinementReply({
      message: options.message,
      agreementState: options.agreementState,
      proposal,
    });
    if (refinementDecision) {
      return legacyRunOperatorTurn({
        ...options,
        agreementState: clearRecommendationRefinementPreparation(
          options.agreementState,
        ),
      });
    }

    const capabilities = await listOperatorCapabilities();
    return runGovernedRecommendationRefinementTurn({
      options,
      proposal,
      preparation,
      capabilities,
      continuation: true,
    });
  }

  const materializationRequested =
    classifyRecommendationRefinementMaterializationRequest({
      message: options.message,
      agreementState: options.agreementState,
      proposal,
    });
  const advanceRequested = classifyRecommendationRefinementAdvanceRequest({
    message: options.message,
    agreementState: options.agreementState,
    proposal,
  });
  if (materializationRequested || advanceRequested) {
    const capabilities = await listOperatorCapabilities();
    return runGovernedRecommendationRefinementTurn({
      options,
      proposal,
      capabilities,
      continuation: false,
    });
  }

  return legacyRunOperatorTurn(options);
}

export default runOperatorTurn;