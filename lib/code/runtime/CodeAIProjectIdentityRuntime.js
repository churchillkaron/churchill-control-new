export const CODE_AI_PROJECT_IDENTITY_CONTRACT = "AVANTIQO_CODE_AI_PROJECT_IDENTITY_V1";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizedRepository(value) {
  return text(value, 1000).toLowerCase().replace(/\/+$/, "").replace(/\.git$/, "");
}
function observedPaths(state = {}) {
  const source = object(state);
  return [
    ...list(source.files_changed),
    ...list(source.evidence).map((entry) => entry?.file_path),
    ...list(source.source_read_evidence).map((entry) => entry?.file_path),
  ].map((item) => text(item, 1000)).filter(Boolean).slice(0, 80);
}

export function deriveCodeAIProjectIdentity({
  repositoryUrl,
  ref = "main",
  objective,
  state = {},
  projectName = null,
} = {}) {
  const repository = normalizedRepository(repositoryUrl || state?.repository_url);
  const ownerBrief = text(objective || state?.objective, 5000) || null;
  return {
    contract: CODE_AI_PROJECT_IDENTITY_CONTRACT,
    repository_url: repository || null,
    ref: text(ref || state?.ref, 160) || "main",
    project_name: text(projectName, 240) || null,
    owner_brief: ownerBrief,
    observed_repository_paths: observedPaths(state),
    product_identity_source: "ACTIVE_REPOSITORY_PLUS_OWNER_BRIEF",
    platform_identity: "AVANTIQO_CODE_ENGINEERING_TOOL",
    platform_is_not_product_identity: true,
    cross_project_product_assumptions_forbidden: true,
    architecture_must_be_derived_from_target_project: true,
    design_system_must_be_derived_from_target_project: true,
    terminology_must_be_derived_from_target_project: true,
    stack_must_be_derived_from_target_project_or_owner_constraint: true,
    reuse_policy: "REUSE_GENERIC_ENGINEERING_CAPABILITIES_NOT_PRODUCT_ASSUMPTIONS",
    forbidden_default_inheritance: [
      "Avantiqo domain names",
      "Avantiqo product terminology",
      "Avantiqo UI/design language",
      "Avantiqo business workflows",
      "Avantiqo organization/entity model",
      "Avantiqo technology stack",
      "Avantiqo provider choices",
    ],
    exception_rule:
      "A product-specific pattern may be used only when the active repository, owner brief, or current repository evidence explicitly supports it.",
    authorization_effect: "NONE",
  };
}

export function formatCodeAIProjectIdentityForPlanner(identity = {}) {
  const source = object(identity);
  return [
    "PROJECT IDENTITY BOUNDARY:",
    "Avantiqo Code is the engineering tool, NOT the product identity of the software being built.",
    `Target repository: ${text(source.repository_url, 1000) || "unknown"}; ref: ${text(source.ref, 160) || "main"}.`,
    source.project_name ? `Project name: ${text(source.project_name, 240)}.` : null,
    source.owner_brief ? `Owner brief: ${text(source.owner_brief, 3000)}` : null,
    "Derive architecture, terminology, UX, data model, workflows, stack choices and product conventions from the active repository and owner brief.",
    "Do NOT copy or infer Avantiqo-specific domains, naming, UI language, workflows, organization/entity concepts, stack, or provider choices into another project unless current target-project evidence explicitly requires them.",
    "Generic engineering capabilities and proven engineering techniques may be reused; product assumptions may not.",
  ].filter(Boolean).join(" ");
}
