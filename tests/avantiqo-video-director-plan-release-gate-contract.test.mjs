import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const qualityMode = fs.readFileSync(
  new URL(
    "../lib/creative/director/runtime/CreativeDirectorQualityModeRuntime.js",
    import.meta.url,
  ),
  "utf8",
);
const binding = fs.readFileSync(
  new URL(
    "../lib/creative/director/runtime/CreativeDirectorPlanProductionBindingRuntime.js",
    import.meta.url,
  ),
  "utf8",
);
const finalGate = fs.readFileSync(
  new URL(
    "../lib/creative/director/runtime/CreativeDirectorPlanFinalReleaseGateRuntime.js",
    import.meta.url,
  ),
  "utf8",
);
const finalisation = fs.readFileSync(
  new URL(
    "../lib/creative/finalisation/runtime/CreativeFinalisationRouter.js",
    import.meta.url,
  ),
  "utf8",
);
const revise = fs.readFileSync(
  new URL(
    "../lib/creative/studio/capabilities/reviseStudioShotSet.js",
    import.meta.url,
  ),
  "utf8",
);

test("confirmed directing revision binds the canonical Director Plan to committed state", () => {
  assert.match(revise, /CreativeDirectorPlanRuntime/);
  assert.match(revise, /CreativeDirectorPlanProductionBindingRuntime/);
  assert.match(revise, /bindCommitted\s*\(/);
  const atomic = revise.indexOf("CreativeAtomicShotSetRevisionRuntime.revise");
  const bind = revise.indexOf("CreativeDirectorPlanProductionBindingRuntime.bindCommitted");
  assert.ok(atomic >= 0, "atomic revision must exist");
  assert.ok(bind > atomic, "production-quality plan binding must happen after the atomic write");
});

test("production binding stores intent separately from the post-commit canonical snapshot", () => {
  assert.match(binding, /director_plan:\s*directorPlan/);
  assert.match(binding, /committed_state:/);
  assert.match(binding, /editable_shots:\s*editableSnapshots/);
  assert.match(binding, /preserved_shots:\s*preservedSnapshots/);
  assert.match(binding, /active_director_quality_plan/);
  assert.match(binding, /revision_number/);
  assert.match(binding, /updated_at/);
  assert.match(binding, /professional_locked_fields/);
});

test("bound production evidence fails closed on scope, stale state, preserved drift and lock drift", () => {
  assert.match(binding, /shot_scope_fidelity:\s*missingEditableRenderEvidence\.length === 0/);
  assert.match(binding, /preserved_shot_immutability:\s*changedPreserved\.length === 0/);
  assert.match(binding, /professional_lock_compliance:\s*lockDrift\.length === 0/);
  assert.match(binding, /stale_plan_freshness:/);
  assert.match(binding, /changedEditable\.length === 0 && changedPreserved\.length === 0/);
  assert.match(binding, /missing_editable_render_evidence_shot_ids/);
});

test("Director quality mode treats evidenced NOT_APPLICABLE semantic checks as neutral", () => {
  assert.match(qualityMode, /check\.status === "NOT_APPLICABLE"/);
  assert.match(qualityMode, /not_applicable_checks:\s*notApplicable/);
  assert.doesNotMatch(
    qualityMode,
    /check\.status === "FAIL" \|\| check\.passed !== true/,
    "NOT_APPLICABLE must not be collapsed into semantic failure",
  );
  assert.match(
    qualityMode,
    /check\.status === "FAIL" \|\|\s*\(check\.status === "PASS" && check\.passed !== true\)/,
  );
});

test("repair handoff is exact-shot bounded and cannot authorize media or publication", () => {
  assert.match(qualityMode, /DIRECTOR_QC_REPAIR_REQUIRES_EXACT_SHOT_SCOPE/);
  assert.match(qualityMode, /DIRECTOR_QC_REPAIR_TOUCHES_PRESERVED_SHOT/);
  assert.match(qualityMode, /DIRECTOR_QC_REPAIR_OUTSIDE_EDITABLE_SET/);
  assert.match(qualityMode, /change_only_failed_requirements:\s*true/);
  assert.match(qualityMode, /automatic_execution_authorized:\s*false/);
  assert.match(qualityMode, /media_generation_authorized:\s*false/);
  assert.match(qualityMode, /publication_authorized:\s*false/);
});

test("final release gate preserves legacy projects but bound plans cannot bypass semantic evidence", () => {
  assert.match(finalGate, /reason:\s*"NO_BOUND_DIRECTOR_PLAN"/);
  assert.match(finalGate, /legacy_or_unbound_production_preserved:\s*true/);
  assert.match(finalGate, /SEMANTIC_QUALITY_REPORT_REQUIRED/);
  assert.match(finalGate, /status:\s*"DIRECTOR_PLAN_QC_BLOCKED"/);
  assert.match(finalGate, /media_generation_authorized:\s*false/);
  assert.match(finalGate, /publication_authorized:\s*false/);
});

test("finalisation runs Director Plan gate before the Intelligence Release Director", () => {
  const directorPlanReview = finalisation.indexOf("await directorPlanReview({");
  const intelligenceReview = finalisation.indexOf("return intelligenceReview({", directorPlanReview);
  assert.ok(directorPlanReview >= 0, "Director Plan release gate must be invoked");
  assert.ok(
    intelligenceReview > directorPlanReview,
    "Intelligence release review must only run after the authoritative Director Plan gate",
  );
});

test("Director Plan QC cannot be upgraded by downstream intelligence when it fails", () => {
  assert.match(finalGate, /success:\s*false/);
  assert.match(finalGate, /passed:\s*false/);
  assert.match(finalGate, /DIRECTOR_PLAN_REPAIR_REQUIRED/);
  assert.match(finalGate, /DIRECTOR_PLAN_QC_REJECTED/);
  assert.match(finalGate, /DIRECTOR_PLAN_QC_BLOCKED/);
  assert.match(finalisation, /result:\s*directorVerdict/);
});
