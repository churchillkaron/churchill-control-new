from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    source = file.read_text()
    if source.count(old) != 1:
        raise SystemExit(f"EXPECTED_ONE_MATCH:{path}:{source.count(old)}")
    file.write_text(source.replace(old, new, 1))


preflight = "app/api/creative/release/preflight/route.js"
replace_once(
    preflight,
    '''  if (typeof policy.require_audio_review !== "boolean") {
    failures.push("require_audio_review");
  }

  return {
''',
    '''  if (typeof policy.require_audio_review !== "boolean") {
    failures.push("require_audio_review");
  }
  if (!text(policy.service_id)) failures.push("service_id");
  if (!text(policy.provider_id)) failures.push("provider_id");
  if (!text(policy.capability)) failures.push("capability");
  if (!text(policy.model)) failures.push("model");

  return {
''',
)
replace_once(
    preflight,
    '''    const publishTarget = validatePublishTarget(
      body.publish_target,
      publishTargetId,
      requiredMediaKind,
    );
''',
    '''    const publishTarget = validatePublishTarget(
      body.publish_target,
      publishTargetId,
      requiredMediaKind,
    );
    const semanticExecutionLinked = executionRequirements.some((item) =>
      item.service_id === text(semanticQuality.policy.service_id) &&
      item.provider_id === text(semanticQuality.policy.provider_id).toLowerCase() &&
      item.capability === text(semanticQuality.policy.capability) &&
      item.model === text(semanticQuality.policy.model));
''',
)
replace_once(
    preflight,
    '''      check("semantic_quality_policy_valid", true, semanticQuality.passed, semanticQuality),
      check("render_timeout_configured", false, configured(process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS)),
''',
    '''      check("semantic_quality_policy_valid", true, semanticQuality.passed, semanticQuality),
      check("semantic_review_execution_linked", true, semanticExecutionLinked, {
        service_id: semanticQuality.policy.service_id || null,
        provider_id: semanticQuality.policy.provider_id || null,
        capability: semanticQuality.policy.capability || null,
        model: semanticQuality.policy.model || null,
      }),
      check("render_timeout_configured", false, configured(process.env.CREATIVE_MEDIA_RENDER_TIMEOUT_MS)),
''',
)

smoke = "scripts/creative-studio-forensic-release-smoke.mjs"
replace_once(
    smoke,
    '''  const technicalPolicy = json("CREATIVE_SMOKE_TECHNICAL_POLICY_JSON");
  const semanticReview = json("CREATIVE_SMOKE_SEMANTIC_REVIEW_JSON");
  const executionRequirements = json("CREATIVE_SMOKE_EXECUTION_REQUIREMENTS_JSON");
''',
    '''  const technicalPolicy = json("CREATIVE_SMOKE_TECHNICAL_POLICY_JSON");
  const executionRequirements = json("CREATIVE_SMOKE_EXECUTION_REQUIREMENTS_JSON");
''',
)
replace_once(
    smoke,
    '''      policy: technicalPolicy,
      semantic_review: semanticReview,
      semantic_policy: semanticPolicy,
      force: true,
''',
    '''      policy: technicalPolicy,
      semantic_policy: semanticPolicy,
      force: true,
''',
)
replace_once(
    smoke,
    '''  report.phases.push({ phase: "quality_review", response: quality });
  evidence = {
''',
    '''  report.phases.push({ phase: "quality_review", response: quality });
  report.assertions.push(
    assertion(
      "semantic_review_autonomous",
      quality.autonomous_semantic_review === true &&
        Boolean(quality.semantic?.evidence_uri) &&
        quality.evidence_complete === true,
      quality.semantic || null,
      "Semantic review was not autonomously generated from persisted render evidence",
    ),
  );
  evidence = {
''',
)

Path("scripts/agent-autonomous-semantic-review-patch.py").unlink()
Path(".github/workflows/agent-autonomous-semantic-review.yml").unlink()
