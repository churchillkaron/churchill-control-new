/**
 * ENFORCEMENT ENGINE
 * SaaS safety control system
 */

export function getEnforcementState({ subscriptionStatus, overdueDays }) {
  if (subscriptionStatus === "active") {
    return "ACTIVE";
  }

  if (overdueDays <= 3) {
    return "GRACE";
  }

  if (overdueDays <= 10) {
    return "RESTRICTED";
  }

  return "SUSPENDED";
}

export function getFeatureAccess(state) {
  return {
    chat: true,
    enhance: state !== "SUSPENDED",
    invoice: state !== "SUSPENDED",
    video: state === "ACTIVE",
    composite: state === "ACTIVE",
    execution: state === "ACTIVE",
  };
}
