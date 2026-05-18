export default async function validateAuthority({
  actor = "SYSTEM",
  action_type,
  risk_level = "LOW",
}) {

  const systemAllowed =
    actor === "SYSTEM" &&
    risk_level !== "CRITICAL";

  const managerAllowed =
    actor === "MANAGER";

  const ownerAllowed =
    actor === "OWNER";

  const allowed =
    ownerAllowed ||
    managerAllowed ||
    systemAllowed;

  return {

    success: true,

    allowed,

    actor,

    action_type,

    risk_level,
  };
}
