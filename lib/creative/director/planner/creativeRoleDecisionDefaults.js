// Roles the registry already says cannot apply to this workflow are completed from the registry rather
// than demanded from the director.
//
// The contract requires an explicit status for all twenty-one agency roles. For a role whose applies_to
// includes the workflow, choosing ACTIVE or NOT_REQUIRED is a real judgement and must be stated with
// reasoning -- that accountability is the point and it is untouched here.
//
// For a role whose applies_to excludes the workflow, it is not a judgement. experience_director is
// INTERACTIVE only and technical_architect is INTERACTIVE and SOFTWARE, so neither can apply to a film,
// and the registry says so before anyone is asked. Requiring the model to echo a lookup adds no
// accountability, and it cost a film every single run: fifteen calls of story, scene architecture and
// shot direction rejected because two disciplines that cannot apply were not declared inapplicable.
//
// The system fills in deterministic workflow exclusions and non-waivable governance decisions.
// Other eligible disciplines remain creative judgements: they may be ACTIVE or accountably NOT_REQUIRED.

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

const MANDATORY_GOVERNANCE_ROLE_DECISIONS = Object.freeze({
  quality_director: (plan) => ({
    status: "ACTIVE",
    decision: `Enforce ${text(plan?.quality?.version) || "the system-owned creative quality policy"} as the release gate and reject work that fails the authored quality, continuity, realism or story requirements.`,
    evidence: [text(plan?.quality?.version) || "system-owned creative quality policy"],
    confidence: 100,
    risks: ["A technically completed output may still fail the authored release-quality threshold."],
    repair_instructions: ["Keep release blocked until every applicable quality failure is repaired and revalidated."],
    derived_from_system_governance: true,
  }),
  rights_safety_director: (plan) => ({
    status: "ACTIVE",
    decision: "Keep licensing, identity, claims, privacy and protected brand material governed throughout production and block release when required evidence is absent.",
    evidence: [`workflow_kind:${text(plan?.workflow_kind) || "UNKNOWN"}`, `asset_manifest_entries:${Array.isArray(plan?.asset_manifest) ? plan.asset_manifest.length : 0}`],
    confidence: 100,
    risks: ["Generated or sourced material may introduce unsupported identity, licensing, claim or brand-use risk."],
    repair_instructions: ["Require traceable rights and safety evidence for any protected or identity-bearing material before release."],
    derived_from_system_governance: true,
  }),
  release_director: (plan) => ({
    status: "ACTIVE",
    decision: "Keep delivery and publication blocked until the governed master, approvals, quality checks, rights checks and required technical validations are complete.",
    evidence: [`workflow_kind:${text(plan?.workflow_kind) || "UNKNOWN"}`, ...((Array.isArray(plan?.deliverables) ? plan.deliverables : []).map((item) => `deliverable:${text(item?.id)}`).filter((item) => item !== "deliverable:"))],
    confidence: 100,
    risks: ["Generation completion can be mistaken for release readiness without explicit release evidence."],
    repair_instructions: ["Do not publish or distribute until all release gates are explicitly satisfied."],
    derived_from_system_governance: true,
  }),
  performance_director: (plan) => ({
    status: "ACTIVE",
    decision: "Define post-release measurement against the mission and deliverable outcome, and keep learning signals separate from creative or release approval itself.",
    evidence: [`workflow_kind:${text(plan?.workflow_kind) || "UNKNOWN"}`, ...((Array.isArray(plan?.deliverables) ? plan.deliverables : []).map((item) => `deliverable:${text(item?.id)}`).filter((item) => item !== "deliverable:"))],
    confidence: 100,
    risks: ["Generic engagement metrics could replace the actual mission outcome if measurement is not bound to the deliverable."],
    repair_instructions: ["Bind post-release learning to the mission outcome and use stronger business signals whenever they are available."],
    derived_from_system_governance: true,
  }),
});

export function applyDerivedRoleDecisions(plan = {}, roles = []) {
  const workflowKind = text(plan?.workflow_kind).toUpperCase();
  if (!workflowKind) return plan;

  const decisions = { ...object(plan.role_decisions) };
  let derived = 0;

  for (const role of roles) {
    const governanceFactory = MANDATORY_GOVERNANCE_ROLE_DECISIONS[role.id];
    const existingGovernance = object(decisions[role.id]);
    if (governanceFactory && !["ACTIVE", "NOT_REQUIRED"].includes(text(existingGovernance.status).toUpperCase())) {
      decisions[role.id] = governanceFactory(plan);
      derived += 1;
      continue;
    }

    const appliesTo = Array.isArray(role?.applies_to) ? role.applies_to : [];
    const eligible = appliesTo.includes("ALL") || appliesTo.includes(workflowKind);
    if (eligible) continue;

    const existing = object(decisions[role.id]);
    if (["ACTIVE", "NOT_REQUIRED"].includes(text(existing.status).toUpperCase())) continue;

    decisions[role.id] = {
      ...existing,
      status: "NOT_REQUIRED",
      // The reason is the registry's own statement, not an invented rationale. Anyone reading the plan
      // can see this was derived rather than decided.
      decision: `Not applicable to ${workflowKind} work. This discipline is registered for ${
        appliesTo.join(" and ") || "other"
      } workflows only, so it is not required for this medium.`,
      derived_from_registry: true,
    };
    derived += 1;
  }

  if (!derived) return plan;
  return { ...plan, role_decisions: decisions };
}

export default applyDerivedRoleDecisions;
