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
// So the system fills in what it already knows and the validator keeps its teeth. A role that could
// have applied and was skipped still fails.

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return String(value ?? "").trim();
}

export function applyDerivedRoleDecisions(plan = {}, roles = []) {
  const workflowKind = text(plan?.workflow_kind).toUpperCase();
  if (!workflowKind) return plan;

  const decisions = { ...object(plan.role_decisions) };
  let derived = 0;

  for (const role of roles) {
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
