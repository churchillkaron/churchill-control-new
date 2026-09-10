import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolvePreparedAttachmentReflex } from "../lib/operator/runtime/OperatorPreparedAttachmentReflex.js";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const capability = [{ key: "projects.projects.create" }];
function attachment(fields = {}) {
  return [{
    id: "file_1", attachment_set_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "project.pdf", logical_object_count: 1,
    analysis: { status: "ANALYZED", evidence: { object_type: "project specification", key_fields: fields } },
    business_match: { status: "NO_MATCH", candidates: [] },
    prepared_candidate: { type: "universal_destination", status: "DESTINATION_RESOLVED", destination: { domain_id: "projects", domain: "Projects", label: "Projects", route: "/projects" }, evidence_classification: { object_type: "project specification" } },
  }];
}

test("project evidence with code and name stages governed create", () => {
  const result = resolvePreparedAttachmentReflex({ message: "add this project", entityId: "entity-1", attachments: attachment({ project_code: "PRJ-77", project_name: "Warehouse Upgrade", start_date: "2026-10-01" }), capabilities: capability });
  assert.equal(result.execution.capability_key, "projects.projects.create");
  assert.equal(result.execution.payload.code, "PRJ-77");
  assert.equal(result.execution.payload.name, "Warehouse Upgrade");
  assert.equal(result.intent, "execute");
});

test("project evidence missing identity asks instead of guessing", () => {
  const result = resolvePreparedAttachmentReflex({ message: "add this project", entityId: "entity-1", attachments: attachment({ project_name: "Warehouse Upgrade" }), capabilities: capability });
  assert.equal(result.intent, "clarify");
  assert.equal(result.execution.capability_key, null);
  assert.match(result.clarification.question, /project code/i);
});

test("Projects runtime is atomic entity scoped and confirmation gated", async () => {
  const [runtime, cap, sql] = await Promise.all([read("lib/projects/runtime/ProjectsRuntime.js"), read("lib/projects/runtime/ProjectsOperatorCapability.js"), read("supabase/migrations/20260910115500_projects_atomic_create.sql")]);
  assert.match(runtime, /createProjectsCreateCapability/);
  assert.match(cap, /operatorRequiresConfirmation: true/);
  assert.match(cap, /contextScope: "entity"/);
  assert.match(cap, /PROJECT_ACTOR_MISMATCH/);
  assert.match(sql, /PROJECT_ENTITY_SCOPE_MISMATCH/);
  assert.match(sql, /PROJECT_CODE_ALREADY_EXISTS/);
  assert.match(sql, /lock table public\.projects in share row exclusive mode/);
  assert.match(sql, /grant execute .* service_role/);
});
