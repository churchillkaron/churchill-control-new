const UNSUPPORTED_ASSUMPTION_PATTERNS = [
  /\bassum(?:e|ed|ing|ption)\b/i,
  /\binfer(?:red|ence|ring)?\b/i,
  /\bdefault\b/i,
  /\btypical(?:ly)?\b/i,
  /\bestimat(?:e|ed|ing|ion)\b/i,
  /\bapprox(?:imate|imately|\.)?\b/i,
  /\bchosen\b/i,
  /\bsuggests?\b/i,
  /\bbest matching\b/i,
  /\bstandard human\b/i,
  /\bfor brand engagement\b/i,
  /\bto reflect\b/i,
  /\bto support\b/i,
  /\bcreating engagement\b/i,
  /\bno movement specified\b/i,
  /\bper scene \d+ analogy\b/i,
];

const CREATIVE_DECISION_PATTERNS = [
  /\bchoose\b/i,
  /\bdecision\b/i,
  /\bdesign choice\b/i,
  /\bnew creative direction\b/i,
  /\bcompatible decision\b/i,
];

const LOCKED_EVIDENCE_PATTERNS = [
  /\blocked\b/i,
  /\bmaster still\b/i,
  /\btemporal contract\b/i,
  /\bkeyframe\b/i,
  /\bexact_[a-z_]+\b/i,
  /\bimmutable\b/i,
  /\bcontinuity\b/i,
  /\bposition(?:_xyz)?\b/i,
  /\brotation(?:_xyz)?\b/i,
  /\bstart_ms\b/i,
  /\bend_ms\b/i,
  /\bat_ms\b/i,
];

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value || "").trim();
}

function mappingAddress({
  stage,
  group,
  mapping,
  index,
}) {
  return {
    stage: stage || null,
    group: group || null,
    mapping_index: index + 1,
    failure: text(mapping.failure) || null,
    field: text(mapping.field) || null,
  };
}

function explicitKind(mapping = {}) {
  const value = text(
    mapping.provenance_kind ||
    mapping.kind ||
    mapping.source_kind,
  ).toUpperCase();

  if (
    [
      "LOCKED_EVIDENCE",
      "DERIVED_FROM_LOCKS",
      "NEW_CREATIVE_DECISION",
      "UNSUPPORTED_ASSUMPTION",
    ].includes(value)
  ) {
    return value;
  }

  return null;
}

function inferredKind(mapping = {}) {
  const description = text(
    mapping.evidence_or_decision ||
    mapping.evidence ||
    mapping.decision ||
    mapping.rationale,
  );

  if (
    UNSUPPORTED_ASSUMPTION_PATTERNS.some(
      (pattern) => pattern.test(description),
    )
  ) {
    return "UNSUPPORTED_ASSUMPTION";
  }

  if (
    CREATIVE_DECISION_PATTERNS.some(
      (pattern) => pattern.test(description),
    )
  ) {
    return "NEW_CREATIVE_DECISION";
  }

  if (
    LOCKED_EVIDENCE_PATTERNS.some(
      (pattern) => pattern.test(description),
    )
  ) {
    return "DERIVED_FROM_LOCKS";
  }

  return "UNCLASSIFIED";
}

function auditMapping({
  stage,
  group,
  mapping,
  index,
}) {
  const source = object(mapping);
  const address = mappingAddress({
    stage,
    group,
    mapping: source,
    index,
  });
  const description = text(
    source.evidence_or_decision ||
    source.evidence ||
    source.decision ||
    source.rationale,
  );
  const sourcePaths = list(
    source.source_paths ||
    source.source_path ||
    source.evidence_paths,
  ).map(text).filter(Boolean);
  const constraints = list(
    source.compatibility_constraints ||
    source.constraints_checked ||
    source.contradiction_checks,
  ).map(text).filter(Boolean);
  const declaredKind = explicitKind(source);
  const resolvedKind =
    declaredKind || inferredKind(source);
  const failures = [];
  const warnings = [];

  if (!address.failure) {
    failures.push("FAILURE_ADDRESS_MISSING");
  }
  if (!address.field) {
    failures.push("FIELD_ADDRESS_MISSING");
  }
  if (!description) {
    failures.push("EVIDENCE_OR_DECISION_MISSING");
  }

  if (
    resolvedKind === "UNSUPPORTED_ASSUMPTION"
  ) {
    failures.push("UNSUPPORTED_ASSUMPTION");
  }

  if (resolvedKind === "UNCLASSIFIED") {
    failures.push("PROVENANCE_KIND_UNCLASSIFIED");
  }

  if (
    declaredKind === "LOCKED_EVIDENCE" &&
    !sourcePaths.length
  ) {
    failures.push("LOCKED_EVIDENCE_SOURCE_PATH_REQUIRED");
  }

  if (
    declaredKind === "DERIVED_FROM_LOCKS" &&
    !sourcePaths.length
  ) {
    failures.push("DERIVATION_SOURCE_PATH_REQUIRED");
  }

  if (
    declaredKind === "NEW_CREATIVE_DECISION" &&
    !constraints.length
  ) {
    failures.push("CREATIVE_DECISION_CONSTRAINTS_REQUIRED");
  }

  if (!declaredKind) {
    warnings.push("LEGACY_MAPPING_WITHOUT_EXPLICIT_PROVENANCE_KIND");
  }

  return {
    ...address,
    passed: failures.length === 0,
    declared_kind: declaredKind,
    resolved_kind: resolvedKind,
    description,
    source_paths: sourcePaths,
    compatibility_constraints: constraints,
    failures,
    warnings,
  };
}

function acceptedGroups(convergence = {}) {
  return list(object(convergence).accepted);
}

export function inspectCreativeRepairProvenance({
  pipelineResult,
} = {}) {
  const pipeline = object(pipelineResult);
  const stages = [
    {
      stage: "STORYBOARD_CONVERGENCE",
      convergence:
        pipeline.storyboard_convergence,
    },
    {
      stage: "FINAL_STORYBOARD_CONVERGENCE",
      convergence:
        pipeline.final_storyboard_convergence,
    },
  ];

  const mappings = [];

  for (const entry of stages) {
    for (
      const group
      of acceptedGroups(entry.convergence)
    ) {
      const values = list(
        group.evidence_mapping,
      );

      for (
        const [index, mapping]
        of values.entries()
      ) {
        mappings.push(
          auditMapping({
            stage: entry.stage,
            group: group.group || null,
            mapping,
            index,
          }),
        );
      }
    }
  }

  const failures = mappings.flatMap(
    (mapping) =>
      mapping.failures.map((failure) => ({
        stage: mapping.stage,
        group: mapping.group,
        mapping_index:
          mapping.mapping_index,
        failure_address:
          mapping.failure,
        field: mapping.field,
        code: failure,
        resolved_kind:
          mapping.resolved_kind,
        description:
          mapping.description,
      })),
  );

  const warnings = mappings.flatMap(
    (mapping) =>
      mapping.warnings.map((warning) => ({
        stage: mapping.stage,
        group: mapping.group,
        mapping_index:
          mapping.mapping_index,
        code: warning,
      })),
  );

  const acceptedRepairGroups =
    stages.reduce(
      (total, entry) =>
        total +
        acceptedGroups(
          entry.convergence,
        ).length,
      0,
    );

  if (
    acceptedRepairGroups > 0 &&
    mappings.length === 0
  ) {
    failures.push({
      stage: null,
      group: null,
      mapping_index: null,
      failure_address: null,
      field: null,
      code:
        "ACCEPTED_REPAIRS_HAVE_NO_PROVENANCE_MAPPING",
      resolved_kind: null,
      description: null,
    });
  }

  return {
    passed: failures.length === 0,
    version:
      "creative-repair-provenance-v1",
    accepted_repair_groups:
      acceptedRepairGroups,
    mapping_count: mappings.length,
    locked_evidence_count:
      mappings.filter((mapping) =>
        mapping.resolved_kind ===
          "LOCKED_EVIDENCE",
      ).length,
    derived_from_locks_count:
      mappings.filter((mapping) =>
        mapping.resolved_kind ===
          "DERIVED_FROM_LOCKS",
      ).length,
    new_creative_decision_count:
      mappings.filter((mapping) =>
        mapping.resolved_kind ===
          "NEW_CREATIVE_DECISION",
      ).length,
    unsupported_assumption_count:
      mappings.filter((mapping) =>
        mapping.resolved_kind ===
          "UNSUPPORTED_ASSUMPTION",
      ).length,
    unclassified_count:
      mappings.filter((mapping) =>
        mapping.resolved_kind ===
          "UNCLASSIFIED",
      ).length,
    failures,
    warnings,
    mappings,
  };
}

export function enforceCreativeRepairProvenance(
  input = {},
) {
  const report =
    inspectCreativeRepairProvenance(input);

  if (!report.passed) {
    const error = new Error(
      "CREATIVE_REPAIR_PROVENANCE_REJECTED",
    );
    error.code =
      "CREATIVE_REPAIR_PROVENANCE_REJECTED";
    error.details = report;
    throw error;
  }

  return report;
}
