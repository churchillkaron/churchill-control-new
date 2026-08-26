export const OPERATOR_MECHANISM_RESEARCH_SPEND_GUARD_CONTRACT =
  "AVANTIQO_MECHANISM_RESEARCH_SPEND_GUARD_V1";

const APPROVAL_ENV = "AVANTIQO_MECHANISM_RESEARCH_SPEND_APPROVED";
const PAID_SYNTHESIS_MODES = new Set(["mechanism", "invention"]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

export function requireOperatorMechanismResearchSpendApproval(mode) {
  const normalizedMode = text(mode, 40).toLowerCase();

  if (normalizedMode === "evidence") {
    return {
      contract: OPERATOR_MECHANISM_RESEARCH_SPEND_GUARD_CONTRACT,
      research_mode: normalizedMode,
      spend_approval_required: false,
      spend_approved: false,
      approval_source: "NOT_REQUIRED",
      authorization_effect: "NONE",
      mutation_authority: "NONE",
    };
  }

  if (!PAID_SYNTHESIS_MODES.has(normalizedMode)) {
    throw new Error(
      `MECHANISM_RESEARCH_SPEND_GUARD_MODE_INVALID:${normalizedMode || "NONE"}`,
    );
  }

  if (text(process.env[APPROVAL_ENV], 40).toUpperCase() !== "YES") {
    throw new Error("MECHANISM_RESEARCH_SYNTHESIS_SPEND_APPROVAL_REQUIRED");
  }

  return {
    contract: OPERATOR_MECHANISM_RESEARCH_SPEND_GUARD_CONTRACT,
    research_mode: normalizedMode,
    spend_approval_required: true,
    spend_approved: true,
    approval_source: "SERVER_ENVIRONMENT",
    authorization_effect: "SYNTHESIS_SPEND_ONLY",
    mutation_authority: "NONE",
  };
}

export default requireOperatorMechanismResearchSpendApproval;
