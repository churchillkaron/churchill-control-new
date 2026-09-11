export const BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_CONTRACT =
  "AVANTIQO_BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_V1";

const REQUIRED_STAGES = Object.freeze([
  "mission_planning",
  "governed_execution",
  "business_effect_verification",
  "failure_capture",
  "defect_classification",
  "self_healing_engineering",
  "governed_release",
  "production_activation",
  "automatic_wake",
  "authoritative_replay",
  "mission_continuation",
  "final_business_outcome",
  "learning_evidence",
]);

function text(value) {
  return String(value ?? "").trim();
}

export function certifyBusinessPartnerLifecycle({ scenario, stages = {} } = {}) {
  const checks = REQUIRED_STAGES.map((stage) => ({
    stage,
    passed: stages?.[stage] === true,
  }));
  const failed = checks.filter((item) => !item.passed).map((item) => item.stage);
  return {
    contract: BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_CONTRACT,
    scenario: text(scenario) || null,
    certified: failed.length === 0,
    status: failed.length === 0 ? "CERTIFIED" : "CERTIFICATION_BLOCKED",
    checks,
    failed_stages: failed,
    production_writes_performed: false,
    production_deploy_performed: false,
    database_migrations_applied: false,
    authorization_effect: "NONE",
  };
}

export const BusinessPartnerLifecycleCertificationRuntime = Object.freeze({
  contract: BUSINESS_PARTNER_LIFECYCLE_CERTIFICATION_CONTRACT,
  required_stages: REQUIRED_STAGES,
  certify: certifyBusinessPartnerLifecycle,
});
