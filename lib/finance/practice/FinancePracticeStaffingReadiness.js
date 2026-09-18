const INTERNAL_ROLES = ["PREPARER", "REVIEWER", "PARTNER"];

function clean(value) {
  return String(value ?? "").trim();
}

function assigneeForRole(profile, role) {
  if (role === "PREPARER") return clean(profile?.assigned_accountant_id) || null;
  if (role === "REVIEWER") return clean(profile?.assigned_reviewer_id) || null;
  if (role === "PARTNER") return clean(profile?.assigned_partner_id) || null;
  return null;
}

export function evaluatePracticeStaffingReadiness({
  steps = [],
  profile = null,
  validStaffIds = null,
} = {}) {
  const requiredRoles = [...new Set(
    (steps || [])
      .map((step) => clean(step?.required_role).toUpperCase())
      .filter((role) => INTERNAL_ROLES.includes(role)),
  )];
  const validSet = validStaffIds instanceof Set ? validStaffIds : null;
  const assignments = Object.fromEntries(
    requiredRoles.map((role) => [role, assigneeForRole(profile, role)]),
  );
  const blockers = [];
  const missingRoles = requiredRoles.filter((role) => !assignments[role]);
  for (const role of missingRoles) blockers.push(`Assign a ${role.toLowerCase()} before creating this accounting cycle`);

  const invalidRoles = validSet
    ? requiredRoles.filter((role) => assignments[role] && !validSet.has(assignments[role]))
    : [];
  for (const role of invalidRoles) blockers.push(`The assigned ${role.toLowerCase()} must be an active accounting-firm member with linked portal access`);

  const rolePairs = [
    ["PREPARER", "REVIEWER"],
    ["PREPARER", "PARTNER"],
    ["REVIEWER", "PARTNER"],
  ];
  const conflicts = rolePairs.filter(([left, right]) =>
    requiredRoles.includes(left) &&
    requiredRoles.includes(right) &&
    assignments[left] &&
    assignments[left] === assignments[right],
  );
  for (const [left, right] of conflicts) {
    blockers.push(`Segregation of duties requires different people for ${left.toLowerCase()} and ${right.toLowerCase()}`);
  }

  return {
    state: blockers.length ? "BLOCKED_STAFF_ASSIGNMENT" : "READY",
    required_roles: requiredRoles,
    assignments,
    missing_roles: missingRoles,
    invalid_roles: invalidRoles,
    conflicts: conflicts.map(([left, right]) => ({ left, right })),
    blockers,
  };
}
