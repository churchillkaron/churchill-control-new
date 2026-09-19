import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildMusicVocalRoleSeparationRequest,
  vocalRoleSeparationCertificationRequirements,
} from "../lib/creative/music/runtime/CreativeMusicVocalRoleSeparationRuntime.js";
import { buildMusicTransformationPlan } from "../lib/creative/runtime/engines/MusicEngine.js";

const source = "storage://creative-assets/example/song.wav";
const rights = { contract: "AVANTIQO_SOURCE_AUDIO_RIGHTS_ATTESTATION_V1", confirmed: true };
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStemsPanel.jsx", "utf8");
const registration = fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoAudioProviderRegistration.js", "utf8");
test("vocal-role request has exact roles and stays non-authoritative", () => {
  const request = buildMusicVocalRoleSeparationRequest({ mode: "LEAD_ONLY_KEEP_BACKING" });
  assert.deepEqual(request.remove_roles, ["LEAD"]);
  assert.deepEqual(request.preserve_roles, ["BACKING", "HARMONY", "CHOIR", "ADLIB"]);
  assert.deepEqual(request.required_outputs, ["lead_vocal", "supporting_vocals", "instrumental"]);
  assert.equal(request.ordinary_four_stem_substitution_forbidden, true);
  assert.equal(request.production_routing_allowed, false);
  assert.equal(request.mutation_authorized, false);
});

test("advanced Stems plan is role-aware and fail-closed", () => {
  const plan = buildMusicTransformationPlan("stems", {
    source_audio: source,
    source_duration_seconds: 180,
    rights_attestation: rights,
    vocal_role_mode: "ROLE_STEMS",
  });
  assert.equal(plan.executable, false);
  assert.equal(plan.separation.vocal_role_request.mode, "ROLE_STEMS");
  assert.deepEqual(plan.output_spec.stems, ["lead_vocal", "supporting_vocals", "instrumental"]);
  assert.equal(plan.output_spec.vocal_role_separation, true);
});
test("certification contract requires human-declared role fixtures and no Demucs fallback", () => {
  const requirements = vocalRoleSeparationCertificationRequirements();
  assert.equal(requirements.benchmark_required, true);
  assert.equal(requirements.human_listening_review_required, true);
  assert.equal(requirements.benchmark_fixture_roles_declared_by_human, true);
  assert.ok(requirements.must_prove.includes("NO_ORDINARY_DEMUCS_FALLBACK"));
  assert.ok(requirements.must_prove.includes("LEAD_REMOVAL_WITH_SUPPORTING_VOCALS_PRESERVED"));
});

test("provider metadata and Stems UI expose the honest research boundary", () => {
  assert.match(registration, /supported_role_labels/);
  assert.match(registration, /required_candidate_outputs/);
  assert.match(registration, /benchmark_fixture_roles_declared_by_human:\s*true/);
  assert.match(registration, /replace_certified_demucs_automatically:\s*false/);
  assert.match(panel, /Standard stems/);
  assert.match(panel, /Vocal roles/);
  assert.match(panel, /no ordinary Demucs fallback/);
  assert.match(panel, /Research \/ benchmark required/);
});
