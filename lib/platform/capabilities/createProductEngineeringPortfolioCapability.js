import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { execute as executeUbteCapability } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireExecutionPermission } from "@/lib/ubte/runtime/security/CapabilityPermissionPolicy";
import {
  buildProductEngineeringPortfolio,
  attachProductEngineeringCycleResult,
  completePortfolioNodeAfterVerifiedPersistence,
  compactProductEngineeringPortfolio,
  persistProductEngineeringPortfolio,
  loadProductEngineeringPortfolio,
  loadLatestProductEngineeringPortfolio,
  AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoProductEngineeringPortfolioRuntime";

const REQUIRED_PERMISSION = "platform.code.ai.execute";
const DEFAULT_REPOSITORY =
  "https://github.com/churchillkaron/churchill-control-new.git";
const DEFAULT_REF = "main";
const MAX_NEW_CYCLES_PER_INVOCATION = 1;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalizedGoal(value) {
  return text(value, 5000).toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizedRepository(value) {
  return text(value, 1000)
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
}

function samePortfolioIntent(portfolio = {}, businessGoal, repositoryUrl) {
  return Boolean(
    normalizedGoal(portfolio.business_goal) &&
    normalizedGoal(portfolio.business_goal) === normalizedGoal(businessGoal) &&
    normalizedRepository(portfolio.repository_url) ===
      normalizedRepository(repositoryUrl || DEFAULT_REPOSITORY) &&
    text(portfolio.ref, 160) === "main"
  );
}

async function executeCapability({
  context,
  capability,
  action,
  payload,
  source,
}) {
  const result = await executeUbteCapability({
    organizationId: context.organizationId,
    domain: "platform",
    capability,
    action,
    payload,
    actor: context.actor,
    runtime: {
      entityId: context.entityId,
      periodId: context.periodId,
      permissions: context.permissions,
      callerRequest: context.callerRequest,
      metadata: {
        ...object(context.metadata),
        source,
        productEngineeringPortfolio: true,
        maximumNewEngineeringCyclesPerInvocation:
          MAX_NEW_CYCLES_PER_INVOCATION,
        parallelCodeExecutionAllowed: false,
        branchOrWorktreeFanoutAllowed: false,
        automaticCommitAllowed: false,
        productionDeploymentAllowed: false,
        databaseMigrationExecutionAllowed: false,
        automaticRecursionAllowed: false,
      },
    },
  });
  return result?.result ?? result;
}

async function assessCurrentMain({
  context,
  repositoryUrl,
  businessGoal,
  verifiedCommitSha = null,
  timeoutMs = null,
}) {
  return executeCapability({
    context,
    capability: "product_repository_assessment",
    action: "read",
    payload: {
      repository_url: repositoryUrl,
      focus: [
        `BUSINESS-LEVEL ENGINEERING PORTFOLIO GOAL: ${text(businessGoal, 2600)}`,
        "Return multiple distinct bounded evidence-backed objective candidates when current-main evidence supports them. The portfolio runtime will derive dependencies and deterministic ranking from those candidates; do not authorize persistence or parallel source mutation.",
      ].join("\n"),
      ...(verifiedCommitSha
        ? { verified_commit_sha: verifiedCommitSha }
        : {}),
      ...(timeoutMs ? { timeout_ms: timeoutMs } : {}),
    },
    source: "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_ASSESS_MAIN",
  });
}

async function runOneEngineeringCycle({
  context,
  portfolio,
  maxIterations,
  timeoutMs,
}) {
  const currentNode = list(portfolio.roadmap).find(
    (node) => node?.node_id === portfolio.current_node_id,
  );
  if (!currentNode?.objective) {
    return {
      portfolio,
      cycle: null,
      started: false,
      reason: "PRODUCT_ENGINEERING_PORTFOLIO_NO_READY_OBJECTIVE",
    };
  }
  if (portfolio?.anti_loop?.triggered === true) {
    return {
      portfolio,
      cycle: null,
      started: false,
      reason: "PRODUCT_ENGINEERING_PORTFOLIO_ANTI_LOOP_REVIEW_REQUIRED",
    };
  }

  currentNode.status = "RUNNING_LOCAL_ENGINEERING";
  portfolio.status = "ENGINEERING_ACTIVE";
  portfolio.updated_at = new Date().toISOString();
  await persistProductEngineeringPortfolio({ context, portfolio });

  const cycle = await executeCapability({
    context,
    capability: "product_engineering_cycle",
    action: "execute",
    payload: {
      focus: currentNode.objective,
      continuation_focus: portfolio.business_goal,
      repository_url: portfolio.repository_url || DEFAULT_REPOSITORY,
      ref: "main",
      ...(maxIterations ? { max_iterations: maxIterations } : {}),
      ...(timeoutMs ? { timeout_ms: timeoutMs } : {}),
    },
    source: "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_RUN_ONE_CYCLE",
  });

  const attached = attachProductEngineeringCycleResult(portfolio, cycle);
  const cycleAssessment = object(cycle.repository_assessment);
  const actualObjective = text(
    cycleAssessment?.objective_selection?.selected_objective ||
      cycleAssessment?.next_engineering_handoff?.focus,
    5000,
  );
  const actualEvidencePaths = list(
    cycleAssessment?.objective_selection?.selected_evidence_paths,
  )
    .map((item) => text(item, 1000))
    .filter(Boolean)
    .slice(0, 20);
  const active = list(attached.roadmap).find(
    (node) => node?.node_id === attached.current_node_id,
  );
  if (active && actualObjective) {
    active.portfolio_proposed_objective = active.objective;
    active.actual_cycle_objective = actualObjective;
    active.objective_refined_by_fresh_cycle_assessment =
      text(active.objective, 5000) !== actualObjective;
    active.objective = actualObjective;
    if (actualEvidencePaths.length) {
      active.actual_cycle_evidence_paths = actualEvidencePaths;
    }
  }
  attached.last_cycle_receipt = {
    ...object(attached.last_cycle_receipt),
    portfolio_proposed_objective:
      text(currentNode.objective, 1800) || null,
    actual_cycle_objective: actualObjective || null,
    objective_refined_by_fresh_cycle_assessment:
      Boolean(actualObjective && actualObjective !== text(currentNode.objective, 5000)),
    fresh_cycle_repository_assessment_authoritative: true,
  };
  await persistProductEngineeringPortfolio({ context, portfolio: attached });
  return { portfolio: attached, cycle, started: true, reason: null };
}

function verifiedCommitFromHandoff(handoff = {}) {
  const continuation = object(handoff.continuation);
  const verified = object(continuation.verified_commit);
  const mission = object(handoff.mission);
  const verifiedStep = list(mission.steps).find(
    (step) => text(step?.id, 160) === "verify_existing_persistence",
  );
  const wrapped = object(verifiedStep?.result);
  const nested = object(wrapped.result);
  const stepResult = Object.keys(nested).length ? nested : wrapped;
  return (
    text(verified.commit_sha, 160) ||
    text(stepResult?.commit?.commit_sha, 160) ||
    null
  );
}

function freshAssessmentFromHandoff(handoff = {}) {
  const continuation = object(handoff.continuation);
  if (continuation.repository_assessment?.repository_snapshot) {
    return object(continuation.repository_assessment);
  }
  if (continuation.repository_snapshot && continuation.objective_selection) {
    return continuation;
  }
  return null;
}

async function resumePersistenceBoundary({
  context,
  portfolio,
  maxIterations,
  timeoutMs,
}) {
  const executionKey = text(portfolio.current_execution_key, 200);
  if (!executionKey) {
    return {
      portfolio,
      handoff: null,
      newCycle: null,
      cycleStarted: false,
      status: "PORTFOLIO_PERSISTENCE_EXECUTION_KEY_REQUIRED",
    };
  }

  const handoff = await executeCapability({
    context,
    capability: "product_persistence_handoff",
    action: "execute",
    payload: {
      execution_key: executionKey,
      focus: portfolio.business_goal,
    },
    source: "AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_PERSISTENCE_BOUNDARY",
  });

  if (handoff.confirmation_required === true || text(handoff.status, 120) === "paused") {
    portfolio.status = "WAITING_GOVERNED_PERSISTENCE";
    const current = list(portfolio.roadmap).find(
      (node) => node?.node_id === portfolio.current_node_id,
    );
    if (current) {
      current.status = "WAITING_GOVERNED_PERSISTENCE";
      current.persistence_confirmation_required = true;
    }
    portfolio.updated_at = new Date().toISOString();
    await persistProductEngineeringPortfolio({ context, portfolio });
    return {
      portfolio,
      handoff,
      newCycle: null,
      cycleStarted: false,
      status: "WAITING_GOVERNED_PERSISTENCE",
    };
  }

  if (text(handoff.status, 120) === "STAY_LOCAL") {
    portfolio.status = "PAUSED_LOCAL_ONLY";
    const current = list(portfolio.roadmap).find(
      (node) => node?.node_id === portfolio.current_node_id,
    );
    if (current) current.status = "PAUSED_LOCAL_ONLY";
    portfolio.updated_at = new Date().toISOString();
    await persistProductEngineeringPortfolio({ context, portfolio });
    return {
      portfolio,
      handoff,
      newCycle: null,
      cycleStarted: false,
      status: "PAUSED_LOCAL_ONLY",
    };
  }

  if (handoff.stale_base_replan_required === true) {
    const freshAssessment = freshAssessmentFromHandoff(handoff);
    if (!freshAssessment) {
      portfolio.status = "STALE_BASE_REPLAN_REQUIRED";
      portfolio.updated_at = new Date().toISOString();
      await persistProductEngineeringPortfolio({ context, portfolio });
      return {
        portfolio,
        handoff,
        newCycle: null,
        cycleStarted: false,
        status: "STALE_BASE_REPLAN_REQUIRED",
      };
    }
    const rebuilt = buildProductEngineeringPortfolio({
      context,
      businessGoal: portfolio.business_goal,
      repositoryUrl: portfolio.repository_url || DEFAULT_REPOSITORY,
      ref: "main",
      repositoryAssessment: freshAssessment,
      previousPortfolio: {
        ...portfolio,
        current_node_id: null,
        current_execution_key: null,
      },
      verifiedCommitSha: null,
    });
    rebuilt.last_invalidated_cycle = {
      execution_key: executionKey,
      reason: "STALE_BASE_REJECTED_BEFORE_PERSISTENCE",
      prior_objective_persisted: false,
      stale_patch_reused: false,
    };
    await persistProductEngineeringPortfolio({ context, portfolio: rebuilt });
    const next = await runOneEngineeringCycle({
      context,
      portfolio: rebuilt,
      maxIterations,
      timeoutMs,
    });
    return {
      portfolio: next.portfolio,
      handoff,
      newCycle: next.cycle,
      cycleStarted: next.started,
      status: next.started ? "FRESH_CYCLE_STARTED_AFTER_STALE_REPLAN" : next.reason,
    };
  }

  const freshAssessment = freshAssessmentFromHandoff(handoff);
  const verifiedCommitSha = verifiedCommitFromHandoff(handoff);
  if (!freshAssessment || !verifiedCommitSha) {
    portfolio.status = "WAITING_VERIFIED_PERSISTENCE";
    portfolio.updated_at = new Date().toISOString();
    await persistProductEngineeringPortfolio({ context, portfolio });
    return {
      portfolio,
      handoff,
      newCycle: null,
      cycleStarted: false,
      status: "WAITING_VERIFIED_PERSISTENCE",
    };
  }

  const completed = completePortfolioNodeAfterVerifiedPersistence({
    portfolio,
    executionKey,
    verifiedCommitSha,
  });
  const rebuilt = buildProductEngineeringPortfolio({
    context,
    businessGoal: completed.business_goal,
    repositoryUrl: completed.repository_url || DEFAULT_REPOSITORY,
    ref: "main",
    repositoryAssessment: freshAssessment,
    previousPortfolio: completed,
    verifiedCommitSha,
  });
  await persistProductEngineeringPortfolio({ context, portfolio: rebuilt });

  if (rebuilt.anti_loop?.triggered === true) {
    return {
      portfolio: rebuilt,
      handoff,
      newCycle: null,
      cycleStarted: false,
      status: "NEEDS_PRODUCT_REVIEW",
    };
  }

  const next = await runOneEngineeringCycle({
    context,
    portfolio: rebuilt,
    maxIterations,
    timeoutMs,
  });
  return {
    portfolio: next.portfolio,
    handoff,
    newCycle: next.cycle,
    cycleStarted: next.started,
    status: next.started ? "NEXT_FRESH_CYCLE_STARTED" : next.reason,
  };
}

async function continueExistingPortfolio({
  context,
  portfolio,
  maxIterations,
  timeoutMs,
}) {
  if (portfolio.status === "READY" && portfolio.current_node_id) {
    const run = await runOneEngineeringCycle({
      context,
      portfolio,
      maxIterations,
      timeoutMs,
    });
    return {
      status: run.started ? "PORTFOLIO_CYCLE_STARTED" : run.reason,
      portfolio: run.portfolio,
      repositoryAssessment: null,
      cycle: run.cycle,
      persistenceHandoff: null,
      newCycleStarted: run.started,
    };
  }

  const resumed = await resumePersistenceBoundary({
    context,
    portfolio,
    maxIterations,
    timeoutMs,
  });
  return {
    status: resumed.status,
    portfolio: resumed.portfolio,
    repositoryAssessment:
      freshAssessmentFromHandoff(resumed.handoff) || null,
    cycle: resumed.newCycle,
    persistenceHandoff: resumed.handoff,
    newCycleStarted: resumed.cycleStarted === true,
  };
}

export function createProductEngineeringPortfolioCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "product_engineering_portfolio",
    action: "execute",
    name: "Run Avantiqo Business-Level Engineering Portfolio",
    document: "product_engineering_portfolio",
    description:
      "Turn one broad Avantiqo business/product improvement goal into a bounded current-main engineering roadmap using the existing repository assessment's two-to-four evidence-backed ranked objective candidates. Derive overlap dependencies deterministically from exact evidence paths and stable source areas. Execute at most one local Product Engineering Cycle per invocation. Queued objectives are provisional, never authority. If the current objective reaches the governed persistence boundary, preserve explicit commit confirmation; only a separately verified main commit may retire that objective. Then reassess actual current main, preserve concurrent progress, rebuild and re-rank the remaining roadmap, and start at most one fresh successor. Exact same-goal continuation is resolved to the actor-scoped persisted portfolio instead of rebuilding history. Never fan out branches/worktrees, run parallel source-mutating Code agents, commit automatically, deploy production, apply migrations, expose raw reasoning, or recurse without bound.",
    permissions: [REQUIRED_PERMISSION],
    events: [],
    tags: [
      "platform",
      "business-goal",
      "product-engineering",
      "portfolio",
      "roadmap",
      "dependency-aware",
      "current-main",
      "fresh-reranking",
      "single-writer",
      "verified-persistence-boundary",
      "server-owned-continuation",
      "no-parallel-code",
      "no-auto-commit",
      "no-deploy",
      "bounded",
    ],
    operatorAliases: [
      "make avantiqo world class",
      "make this avantiqo domain world class",
      "improve this whole avantiqo area",
      "finish this avantiqo domain end to end",
      "run a business-level engineering roadmap",
      "turn this product goal into an engineering roadmap",
    ],
    operatorExamples: [
      "Make Finance tax world-class end to end and keep working through the highest-impact repository-grounded gaps.",
      "Improve the whole Pest Control Operations domain as one governed business roadmap, not one isolated code fix.",
      "Make Code Studio world-class against the strongest current coding systems, with a visible roadmap and verified persistence gates.",
    ],
    transactional: false,
    aiEnabled: true,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: true,
    operatorRequiresConfirmation: false,
    contextScope: "organization",
    risk: "low",
    reversible: true,
    inputSchema: {
      type: "object",
      properties: {
        business_goal: {
          type: "string",
          minLength: 1,
          maxLength: 5000,
        },
        portfolio_id: {
          type: "string",
          minLength: 12,
          maxLength: 180,
        },
        repository_url: {
          type: "string",
          maxLength: 500,
          default: DEFAULT_REPOSITORY,
        },
        ref: {
          type: "string",
          maxLength: 160,
          default: DEFAULT_REF,
        },
        max_iterations: {
          type: "integer",
          minimum: 1,
          maximum: 24,
          default: 16,
        },
        timeout_ms: {
          type: "integer",
          minimum: 30000,
          maximum: 1200000,
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        portfolio_id: { type: "string" },
        portfolio: { type: "object" },
        repository_assessment: { type: ["object", "null"] },
        cycle: { type: ["object", "null"] },
        persistence_handoff: { type: ["object", "null"] },
        new_cycle_started: { type: "boolean" },
        resumed_existing_portfolio: { type: "boolean" },
        production_deployed: { type: "boolean" },
      },
      additionalProperties: true,
    },
  });

  function authorize({ context }) {
    return requireExecutionPermission(context, REQUIRED_PERMISSION);
  }

  async function execute({ context, payload = {} }) {
    const portfolioId = text(payload.portfolio_id, 180) || null;
    const requestedRef = text(payload.ref, 160) || DEFAULT_REF;
    if (requestedRef !== DEFAULT_REF) {
      throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_MAIN_ONLY");
    }
    const repositoryUrl = text(payload.repository_url, 500) || DEFAULT_REPOSITORY;
    const maxIterations = Number.isInteger(Number(payload.max_iterations))
      ? Math.max(1, Math.min(24, Number(payload.max_iterations)))
      : 16;
    const timeoutMs = Number.isInteger(Number(payload.timeout_ms))
      ? Math.max(30000, Math.min(1200000, Number(payload.timeout_ms)))
      : null;

    if (portfolioId) {
      const loaded = await loadProductEngineeringPortfolio({
        context,
        portfolioId,
      });
      if (!loaded.found || !loaded.portfolio) {
        throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_NOT_FOUND");
      }
      const continued = await continueExistingPortfolio({
        context,
        portfolio: loaded.portfolio,
        maxIterations,
        timeoutMs,
      });
      return {
        status: continued.status,
        portfolio_id: portfolioId,
        portfolio: compactProductEngineeringPortfolio(continued.portfolio),
        repository_assessment: continued.repositoryAssessment,
        cycle: continued.cycle,
        persistence_handoff: continued.persistenceHandoff,
        new_cycle_started: continued.newCycleStarted,
        resumed_existing_portfolio: true,
        production_deployed: false,
        database_migrations_applied: false,
        automatic_commit_performed: false,
      };
    }

    const businessGoal = text(payload.business_goal, 5000);
    if (!businessGoal) {
      throw new Error("PRODUCT_ENGINEERING_PORTFOLIO_BUSINESS_GOAL_REQUIRED");
    }

    const latest = await loadLatestProductEngineeringPortfolio({ context });
    if (
      latest.found &&
      latest.portfolio &&
      samePortfolioIntent(latest.portfolio, businessGoal, repositoryUrl)
    ) {
      const continued = await continueExistingPortfolio({
        context,
        portfolio: latest.portfolio,
        maxIterations,
        timeoutMs,
      });
      return {
        status: continued.status,
        portfolio_id: latest.portfolio.portfolio_id,
        portfolio: compactProductEngineeringPortfolio(continued.portfolio),
        repository_assessment: continued.repositoryAssessment,
        cycle: continued.cycle,
        persistence_handoff: continued.persistenceHandoff,
        new_cycle_started: continued.newCycleStarted,
        resumed_existing_portfolio: true,
        production_deployed: false,
        database_migrations_applied: false,
        automatic_commit_performed: false,
      };
    }

    const assessment = await assessCurrentMain({
      context,
      repositoryUrl,
      businessGoal,
      timeoutMs,
    });
    let portfolio = buildProductEngineeringPortfolio({
      context,
      businessGoal,
      repositoryUrl,
      ref: "main",
      repositoryAssessment: assessment,
    });
    await persistProductEngineeringPortfolio({ context, portfolio });

    const run = await runOneEngineeringCycle({
      context,
      portfolio,
      maxIterations,
      timeoutMs,
    });
    portfolio = run.portfolio;
    return {
      status: run.started ? "PORTFOLIO_CREATED_AND_CYCLE_STARTED" : run.reason,
      portfolio_id: portfolio.portfolio_id,
      portfolio: compactProductEngineeringPortfolio(portfolio),
      repository_assessment: assessment,
      cycle: run.cycle,
      persistence_handoff: run.cycle?.persistence_handoff || null,
      new_cycle_started: run.started,
      resumed_existing_portfolio: false,
      production_deployed: false,
      database_migrations_applied: false,
      automatic_commit_performed: false,
      governance: {
        contract: AVANTIQO_PRODUCT_ENGINEERING_PORTFOLIO_CONTRACT,
        business_goal_is_execution_authority: false,
        current_main_repository_evidence_is_authoritative: true,
        ranked_candidates_reused_without_extra_portfolio_planning_call: true,
        deterministic_dependency_derivation: true,
        queued_objectives_are_provisional: true,
        server_owned_exact_goal_continuation: true,
        maximum_active_engineering_cycles: 1,
        maximum_new_cycles_started_this_invocation:
          MAX_NEW_CYCLES_PER_INVOCATION,
        parallel_code_execution_allowed: false,
        branch_or_worktree_fanout_allowed: false,
        verified_persistence_required_before_objective_retirement: true,
        fresh_main_reranking_after_verified_persistence: true,
        automatic_commit_allowed: false,
        production_deployment_allowed: false,
        database_migration_execution_allowed: false,
        automatic_recursion_allowed: false,
        raw_reasoning_returned: false,
        authorization_effect: "NONE",
      },
    };
  }

  return { manifest, authorize, execute };
}

export default createProductEngineeringPortfolioCapability;
