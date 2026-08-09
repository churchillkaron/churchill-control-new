const APPROVER_ROLES = new Set([
  "OWNER",
  "ADMIN",
  "ADMINISTRATOR",
  "SUPER_ADMIN",
  "MANAGER",
  "GENERAL_MANAGER",
  "GENERAL MANAGER",
]);

export function canApproveReviewResponses(context = {}) {
  const roles = [
    context.role,
    context.membership?.role,
    context.staff?.role,
    context.staff?.role_name,
    context.staff?.position,
  ]
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);

  return roles.some((role) => APPROVER_ROLES.has(role));
}
