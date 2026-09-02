import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  page: await readFile("app/(system)/workspace/[organizationId]/creative/code/page.jsx", "utf8"),
  ui: await readFile("components/creative/code/CreativeCodeStudio.jsx", "utf8"),
  route: await readFile("app/api/operator/code/mission/route.js", "utf8"),
  planner: await readFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8"),
  provider: await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeProviderRegistration.js", "utf8"),
};

const previewContext = await import("../lib/code/runtime/CodeAIInteractivePreviewContextRuntime.js");

test("Code Studio page opens the real controller instead of the placeholder shell", () => {
  assert.match(files.page, /CreativeCodeStudio/);
  assert.doesNotMatch(files.page, /CreativeRuntimeEntryShell/);
  assert.match(files.ui, /\/api\/operator\/code\/mission/);
  assert.match(files.ui, /\/api\/operator\/code\/progress/);
  assert.match(files.ui, /code-studio:\$\{crypto\.randomUUID\(\)\}/);
  assert.match(files.ui, /resume_state: resumeState/);
  assert.match(files.ui, /Preview sandbox · no commit · no deploy/);
});

test("Code Studio controller enforces permission and preview-only service lifecycle", () => {
  assert.match(files.route, /platform\.code\.ai\.execute/);
  assert.match(files.route, /createCodeAIAutonomousCapability/);
  assert.match(files.route, /withCodeAIInteractivePreviewContext/);
  assert.match(files.route, /AVANTIQO_CODE_STUDIO_PREVIEW/);
  assert.match(files.route, /usage_enabled: true/);
  assert.match(files.route, /billing_enabled: true/);
  assert.match(files.route, /restorePreviewService/);
  assert.match(files.route, /finally/);
  assert.match(files.route, /production_routing_activated: false/);
  assert.match(files.route, /commit_performed: false/);
  assert.match(files.route, /production_deploy_performed: false/);
  assert.doesNotMatch(files.route, /code_ai_commit/);
});

test("hosted preview remains owned-only without activating production pricing", () => {
  assert.match(files.planner, /codeAIInteractivePreviewContext/);
  assert.match(files.planner, /code_studio_interactive_preview/);
  assert.match(files.planner, /execution_scope: LOCAL_REVIEW_SCOPE/);
  assert.match(files.planner, /benchmark_only: true/);
  assert.match(files.planner, /owned_only_required: true/);
  assert.match(files.planner, /external_fallback_allowed: false/);
  assert.match(files.provider, /owned_only_required: true/);
  assert.match(files.provider, /external_provider_fallback_allowed: false/);
});

test("interactive preview context is request scoped and does not leak", async () => {
  assert.equal(previewContext.codeAIInteractivePreviewContext(), null);
  const values = await Promise.all([
    previewContext.withCodeAIInteractivePreviewContext({
      organization_id: "org-a",
      actor_id: "actor-a",
      execution_key: "code-studio:aaaaaaaaaaaa",
    }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return previewContext.codeAIInteractivePreviewContext();
    }),
    previewContext.withCodeAIInteractivePreviewContext({
      organization_id: "org-b",
      actor_id: "actor-b",
      execution_key: "code-studio:bbbbbbbbbbbb",
    }, async () => previewContext.codeAIInteractivePreviewContext()),
  ]);
  assert.equal(values[0].organization_id, "org-a");
  assert.equal(values[1].organization_id, "org-b");
  assert.equal(values[0].external_fallback_allowed, false);
  assert.equal(values[0].commit_authority, false);
  assert.equal(values[0].deploy_authority, false);
  assert.equal(previewContext.codeAIInteractivePreviewContext(), null);
});
