import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  compactProductEngineeringPortfolio,
  loadLatestProductEngineeringPortfolio,
  loadProductEngineeringPortfolio,
} from "@/lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioRuntime";
import {
  applyProductEngineeringPortfolioOwnerDecision,
  attachOwnerControlToProductEngineeringPortfolioProjection,
  AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioOwnerControlRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const ACTIONS = ["PAUSE", "RESUME", "PROMOTE", "DEFER", "REMOVE", "RESTORE"];

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeAction(value) {
  const action = text(value, 80).toUpperCase().replace(/[\s-]+/g, "_");
  if (["PAUSE", "PAUSE_PORTFOLIO", "STOP_AFTER_CURRENT"].includes(action)) return "PAUSE";
  if (["RESUME", "RESUME_PORTFOLIO", "CONTINUE_PORTFOLIO"].includes(action)) return "RESUME";
  if (["PROMOTE", "PRIORITIZE", "MAKE_NEXT", "MOVE_NEXT"].includes(action)) return "PROMOTE";
  if (["DEFER", "LOWER_PRIORITY", "MOVE_LATER"].includes(action)) return "DEFER";
  if (["REMOVE", "DROP", "SKIP"].includes(action)) return "REMOVE";
  if (["RESTORE", "UNDO", "CLEAR_DIRECTIVE"].includes(action)) return "RESTORE";
  return null;
}

async function resolvePortfolio({ context, portfolioId }) {
  if (portfolioId) {
    return loadProductEngineeringPortfolio({ context, portfolioId });
  }
  return loadLatestProductEngineeringPortfolio({ context });
}

export function createProductEngineeringPortfolioControlCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_engineering_portfolio_control",
    action: "execute",
    name: "Control Avantiqo Product Engineering Portfolio",
    document: "product_engineering_portfolio_control",
    description:
      "Apply a durable owner decision to the actor- and organization-scoped Product Engineering portfolio. Pause or resume autonomous roadmap progression, or promote, defer, remove, or restore a queued objective. An already claimed objective is immutable; owner decisions affect future execution order only and are re-applied after fresh-main reassessment. This capability never edits source, commits, deploys, migrates, promotes knowledge, or bypasses the governed persistence boundary.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "product-engineering",
      "portfolio",
      "owner-control",
      "pause",
      "resume",
      "prioritize",
      "defer",
      "remove",
      "restore",
      "business-partner",
      "no-source-mutation",
      "no-auto-commit",
      "no-deploy",
    ],
    operatorAliases: [
      "pause the engineering roadmap",
      "resume the engineering roadmap",
      "pause this portfolio",
      "resume this portfolio",
      "make this objective next",
      "prioritize this roadmap objective",
      "defer this roadmap objective",
      "remove this roadmap objective",
      "restore this roadmap objective",
      "skip this objective for now",
    ],
    operatorExamples: [
      "Pause the Code Studio engineering roadmap after the current objective.",
      "Make the tax evidence objective next in the roadmap.",
      "Defer the reporting objective until later.",
      "Remove the third queued objective from this portfolio.",
      "Resume the roadmap.",
    ],
    transactional: false,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      required: ["action"],
      properties: {
        action: {
          type: "string",
          enum: ACTIONS,
        },
        portfolio_id: {
          type: "string",
          minLength: 12,
          maxLength: 200,
        },
        node_id: {
          type: "string",
          minLength: 8,
          maxLength: 200,
        },
        objective: {
          type: "string",
          minLength: 2,
          maxLength: 1800,
        },
        reason: {
          type: "string",
          maxLength: 800,
        },
        expected_control_revision: {
          type: "integer",
          minimum: 0,
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        action: { type: "string" },
        decision: { type: "object" },
        owner_control: { type: "object" },
        portfolio: { type: "object" },
        source_code_mutated: { type: "boolean" },
        commit_performed: { type: "boolean" },
        production_deployed: { type: "boolean" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const action = normalizeAction(payload.action);
    if (!ACTIONS.includes(action)) {
      throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_CONTROL_ACTION_INVALID");
    }
    const portfolioId = text(payload.portfolio_id, 200) || null;
    const loaded = await resolvePortfolio({ context, portfolioId });
    if (!loaded.found || !loaded.portfolio) {
      throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_NOT_FOUND");
    }
    const result = await applyProductEngineeringPortfolioOwnerDecision({
      context,
      portfolio: loaded.portfolio,
      action,
      nodeId: text(payload.node_id, 200) || null,
      objectiveQuery: text(payload.objective, 1800) || null,
      reason: text(payload.reason, 800) || null,
      source: "BUSINESS_PARTNER_CAPABILITY",
      expectedControlRevision: payload.expected_control_revision ?? null,
    });
    const compact = compactProductEngineeringPortfolio(result.governed_portfolio);
    const visible = attachOwnerControlToProductEngineeringPortfolioProjection({
      compactPortfolio: compact,
      governedPortfolio: result.governed_portfolio,
      control: result.control,
    });
    return {
      success: true,
      contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_OWNER_CONTROL_CONTRACT,
      action,
      decision: result.decision,
      owner_control: result.control,
      portfolio: visible,
      current_objective_immutable_once_claimed: true,
      owner_controls_future_execution_order_only: true,
      source_code_mutated: false,
      commit_performed: false,
      production_deployed: false,
      database_migrations_applied: false,
      automatic_knowledge_promotion: false,
      authorization_effect: "NONE",
    };
  }

  return { manifest, authorize, execute };
}

export default createProductEngineeringPortfolioControlCapability;
