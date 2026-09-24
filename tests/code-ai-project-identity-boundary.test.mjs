import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CODE_AI_PROJECT_IDENTITY_CONTRACT,
  deriveCodeAIProjectIdentity,
  formatCodeAIProjectIdentityForPlanner,
} from "../lib/code/runtime/CodeAIProjectIdentityRuntime.js";

const planner = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
const plannerV2 = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageRuntimeV2.js", "utf8");
const conversation = fs.readFileSync("lib/code/runtime/CodeAIConversationRuntime.js", "utf8");
const memory = fs.readFileSync("lib/code/runtime/CodeAIVerifiedEngineeringMemoryRuntime.js", "utf8");
const history = fs.readFileSync("lib/code/runtime/CodeAIMissionHistoryRuntime.js", "utf8");

test("unrelated project identity is owned by its repository and brief, not Avantiqo product assumptions", () => {
  const identity = deriveCodeAIProjectIdentity({
    repositoryUrl: "https://github.com/acme/private-jet-booking.git",
    ref: "main",
    objective: "Build a private jet booking platform for operators and travelers.",
    projectName: "SkyCharter",
    state: {
      repository_url: "https://github.com/acme/private-jet-booking.git",
      evidence: [{ action: "read", file_path: "composer.json" }],
    },
  });

  assert.equal(identity.contract, CODE_AI_PROJECT_IDENTITY_CONTRACT);
  assert.equal(identity.repository_url, "https://github.com/acme/private-jet-booking");
  assert.equal(identity.project_name, "SkyCharter");
  assert.equal(identity.platform_identity, "AVANTIQO_CODE_ENGINEERING_TOOL");
  assert.equal(identity.platform_is_not_product_identity, true);
  assert.equal(identity.cross_project_product_assumptions_forbidden, true);
  assert.equal(identity.architecture_must_be_derived_from_target_project, true);
  assert.match(identity.owner_brief, /private jet booking/i);
  assert.ok(identity.forbidden_default_inheritance.includes("Avantiqo domain names"));
  assert.ok(identity.forbidden_default_inheritance.includes("Avantiqo UI/design language"));
  assert.ok(identity.forbidden_default_inheritance.includes("Avantiqo technology stack"));
});

test("planner boundary explicitly forbids Avantiqo product leakage into unrelated projects", () => {
  const identity = deriveCodeAIProjectIdentity({
    repositoryUrl: "https://git.example.com/customer/laravel-support",
    objective: "Add an AI support inbox to the existing Laravel application.",
  });
  const prompt = formatCodeAIProjectIdentityForPlanner(identity);

  assert.match(prompt, /Avantiqo Code is the engineering tool, NOT the product identity/i);
  assert.match(prompt, /active repository and owner brief/i);
  assert.match(prompt, /Do NOT copy or infer Avantiqo-specific domains/i);
  assert.match(prompt, /Generic engineering capabilities.*may be reused; product assumptions may not/i);
});

test("live conversation distinguishes explanation from a real build command", () => {
  assert.match(conversation, /const explanatoryQuestion =/);
  assert.match(conversation, /const directBuildRequest =/);
  assert.match(conversation, /!explanatoryQuestion/);
  assert.match(conversation, /can you explain/);
  assert.match(conversation, /can you\|could you\|please\|i want you to/);
});

test("project identity firewall is injected into planner and live conversation", () => {
  assert.match(planner, /deriveCodeAIProjectIdentity/);
  assert.match(planner, /formatCodeAIProjectIdentityForPlanner\(projectIdentity\)/);
  assert.match(conversation, /Avantiqo Code is the engineering tool, not the user's product/);
  assert.match(conversation, /Never import Avantiqo product domains, UI style, workflows, organization\/entity concepts, stack choices, or provider choices/);
});

test("project identity persists with mission state and mission history", () => {
  assert.match(planner, /project_identity: deriveCodeAIProjectIdentity/);
  assert.match(plannerV2, /project_identity: deriveCodeAIProjectIdentity/);
  assert.match(history, /project_identity: object\(state\.project_identity\)/);
});

test("verified engineering memory remains repository-scoped", () => {
  assert.match(memory, /same organization\/actor and repository/);
  assert.match(memory, /repositoryUrl/);
  assert.match(memory, /normalizedRepository/);
});
test("project identity sees nested source-read evidence paths and deduplicates them", () => {
  const identity = deriveCodeAIProjectIdentity({
    repositoryUrl: "https://github.com/acme/example",
    objective: "Repair the observed target module.",
    state: {
      files_changed: ["lib/changed.js"],
      evidence: [{ action: "read", result: { file_path: "lib/evidence.js" } }],
      source_read_evidence: [
        { action: "read", result: { file_path: "lib/target.js" } },
        { action: "read", result: { file_path: "lib/target.js" } },
      ],
    },
  });
  assert.deepEqual(identity.observed_repository_paths, [
    "lib/changed.js",
    "lib/evidence.js",
    "lib/target.js",
  ]);
});
