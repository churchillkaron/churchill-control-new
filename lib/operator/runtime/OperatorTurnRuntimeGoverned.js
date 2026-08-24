import {
  agreementWithOperatorRecommendation,
  operatorRecommendationFromAgreementState,
  operatorRecommendationMatchesPendingExecution,
} from "@/lib/operator/contracts/OperatorRecommendationState";
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
  return legacy.runOperatorTurn(options);
}

export async function runOperatorTurn(options = {}) {
  const proposal = recommendationRefinementProposalFromAgreementState(
    options.agreementState,
  );
  if (!proposal) return legacyRunOperatorTurn(options);

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
