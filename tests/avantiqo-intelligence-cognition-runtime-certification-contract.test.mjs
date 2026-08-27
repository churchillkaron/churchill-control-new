import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL(
    "../scripts/run-avantiqo-intelligence-cognition-runtime-certification-local.mjs",
    import.meta.url,
  ),
  "utf8",
);

test("controlled cognition certification exposes its canonical contract", () => {
  assert.match(
    source,
    /AVANTIQO_INTELLIGENCE_COGNITION_RUNTIME_CERTIFICATION_V1/,
  );
  assert.match(source, /const MAX_PROVIDER_REQUESTS = 5/);
  assert.match(source, /provider_request_hard_ceiling:\s*MAX_PROVIDER_REQUESTS/);
});

test("preflight remains zero-inference and execution requires explicit spend approval", () => {
  assert.match(source, /mode === "PREFLIGHT"/);
  assert.match(source, /provider_requests_submitted:\s*0/);
  assert.match(
    source,
    /AVANTIQO_INTELLIGENCE_COGNITION_CERT_SPEND_APPROVED=YES_REQUIRED/,
  );
  assert.match(source, /NODE_ENV/);
  assert.match(source, /development/);
});

test("certification uses an explicitly designated organization and read-only wallet preflight", () => {
  assert.match(source, /AVANTIQO_INTELLIGENCE_COGNITION_CERT_ORGANIZATION_ID/);
  assert.match(source, /AVANTIQO_INTELLIGENCE_BENCHMARK_ORGANIZATION_ID/);
  assert.match(source, /AVANTIQO_MUSIC_BENCHMARK_ORGANIZATION_ID/);
  assert.match(source, /AVANTIQO_COGNITION_CERT_BENCHMARK_ORGANIZATION_REQUIRED/);
  assert.match(source, /WalletRepository\.getByOrganization\(organizationId\)/);
  assert.doesNotMatch(source, /WalletRuntime\.getOrCreate/);
  assert.doesNotMatch(source, /WalletRuntime\.topup/);
});

test("certification is bound to the owned Deep provider safe lease", () => {
  assert.match(source, /const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"/);
  assert.match(source, /const SAFE_LEASE_LANE = "intelligence-deep"/);
  assert.match(source, /RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID/);
  assert.match(source, /AVANTIQO_COGNITION_CERT_SAFE_LEASE_ENDPOINT_MISMATCH/);
  assert.match(source, /execution_lane:\s*"deep"/);
  assert.match(source, /AVANTIQO_COGNITION_CERT_ENDPOINT_NOT_QUIESCENT/);
});

test("provider routing is owned-only benchmark preview with no fallback", () => {
  assert.match(source, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(source, /execution_scope:\s*"BENCHMARK_REVIEW_PREVIEW"/);
  assert.match(source, /benchmark_only:\s*true/);
  assert.match(source, /owned_only_required:\s*true/);
  assert.match(source, /external_fallback_allowed:\s*false/);
  assert.match(source, /selectedProvider\?\.provider !== OWNED_PROVIDER/);
});

test("certification tool is non-mutating and exact research-capability bound", () => {
  assert.match(source, /name:\s*"operator_live_read"/);
  assert.match(source, /const RESEARCH_CAPABILITY = "platform\.research\.search"/);
  assert.match(source, /enum:\s*\[RESEARCH_CAPABILITY\]/);
  assert.match(source, /mutates:\s*false/);
  assert.match(source, /approval_required:\s*false/);
  assert.match(source, /allow_mutating_tools:\s*false/);
});

test("real reasoning transcript certifies sufficient evidence and diminishing returns", () => {
  assert.match(source, /runIntelligenceReasoningLoop/);
  assert.match(source, /applyAvantiqoEpistemicCompletionGate/);
  assert.match(source, /source-backed-sufficient-evidence/);
  assert.match(source, /stopReason:\s*"sufficient_evidence"/);
  assert.match(source, /CERT_SUFFICIENT_EVIDENCE_DONE/);
  assert.match(source, /observed-zero-marginal-research-utility/);
  assert.match(source, /stopReason:\s*"diminishing_returns"/);
  assert.match(source, /CERT_DIMINISHING_RETURNS_DONE/);
  assert.match(source, /OBSERVED_ZERO_MARGINAL_RESEARCH_UTILITY/);
});

test("certification preserves raw evidence and reasoning privacy", () => {
  assert.match(source, /raw_research_persisted:\s*false/);
  assert.match(source, /raw_reasoning_persisted:\s*false/);
  assert.match(source, /raw_research_identity_leaked_in_transcript/);
  assert.match(source, /secrets_printed:\s*false/);
});

test("certification has no production mutation or activation effect", () => {
  assert.match(source, /production_deploy_performed:\s*false/);
  assert.match(source, /provider_selection_changed:\s*false/);
  assert.match(source, /pricing_activation_performed:\s*false/);
  assert.match(source, /business_domain_mutation_performed:\s*false/);
  assert.match(source, /deterministic_certification_tool_mutation_performed:\s*false/);
  assert.match(source, /external_research_performed:\s*false/);
  assert.doesNotMatch(source, /vercel\s+(?:--prod|deploy)/);
});
