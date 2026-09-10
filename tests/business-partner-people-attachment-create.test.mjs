import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolvePreparedAttachmentReflex } from "../lib/operator/runtime/OperatorPreparedAttachmentReflex.js";
import { routeAnalyzedAttachment } from "../lib/platform/runtime/UniversalAttachmentRoutingRuntime.js";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
function cv(fields = {}) {
  return [{ id:"file_1", attachment_set_id:"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name:"cv.pdf", mime_type:"application/pdf", logical_object_count:1,
    analysis:{ status:"ANALYZED", candidate_domains:["People","Documents"], evidence:{ object_type:"resume", document_type:"cv", key_fields:fields, candidate_domains:["People","Documents"] } },
    business_match:{ status:"NO_MATCH", candidates:[] },
    prepared_candidate:{ type:"universal_destination", status:"DESTINATION_RESOLVED", destination:{ domain_id:"people", domain:"People", item_id:"employees", label:"Employees", route:"/workforce/employees" }, evidence_classification:{ object_type:"resume" } },
  }];
}

test("CV/resume resolves to canonical People Employees item", () => {
  const registry = {
    domains: [{ id:"people", name:"People", route:"/people" }, { id:"documents", name:"Documents", route:"/documents" }],
    workspaces: { people: { title:"People", groups:[{ id:"workforce", name:"Workforce", items:[{ id:"employees", name:"Employees", route:"/workforce/employees" }] }] } },
  };
  const routed = routeAnalyzedAttachment(cv()[0], { registry });
  assert.equal(routed.status, "DESTINATION_RESOLVED");
  assert.equal(routed.destination.domain_id, "people");
  assert.equal(routed.destination.item_id, "employees");
});

test("explicit employee intent stages governed employee lifecycle", () => {
  const result = resolvePreparedAttachmentReflex({ message:"create this employee", entityId:"entity-1", attachments:cv({ full_name:"Anna Example", email:"anna@example.com", job_title:"Accountant" }), capabilities:[{key:"people.employees.create"},{key:"documents.files.create"}] });
  assert.equal(result.execution.capability_key, "people.employees.create");
  assert.equal(result.execution.payload.name, "Anna Example");
  assert.equal(result.execution.payload.email, "anna@example.com");
  assert.match(result.response_text, /Portal access, payroll and compensation are not created/);
});

test("filing a CV creates evidence only, not an employee", () => {
  const result = resolvePreparedAttachmentReflex({ message:"file this CV", entityId:"entity-1", attachments:cv({ full_name:"Anna Example", email:"anna@example.com" }), capabilities:[{key:"people.employees.create"},{key:"documents.files.create"}] });
  assert.equal(result.execution.capability_key, "documents.files.create");
  assert.match(result.response_text, /evidence only/);
});

test("employee creation asks for missing email and legal entity", () => {
  const missingEmail = resolvePreparedAttachmentReflex({ message:"hire this person", entityId:"entity-1", attachments:cv({ full_name:"Anna Example" }), capabilities:[{key:"people.employees.create"}] });
  assert.equal(missingEmail.intent, "clarify");
  assert.match(missingEmail.clarification.question, /employee email/i);
  const missingEntity = resolvePreparedAttachmentReflex({ message:"hire this person", entityId:null, attachments:cv({ full_name:"Anna Example", email:"anna@example.com" }), capabilities:[{key:"people.employees.create"}] });
  assert.equal(missingEntity.intent, "clarify");
  assert.match(missingEntity.clarification.question, /legal entity/i);
});

test("People Operator capability reuses management auth and employment lifecycle without access provisioning", async () => {
  const [cap, domain] = await Promise.all([read("lib/people/runtime/PeopleOperatorCapability.js"),read("lib/people/runtime/PeopleOperatorDomainRuntime.js")]);
  assert.match(cap, /createEmployeeWithEmployment/);
  assert.match(cap, /MANAGE_ROLES/);
  assert.match(cap, /operatorRequiresConfirmation: true/);
  assert.match(cap, /contextScope: "entity"/);
  assert.match(cap, /portal_access_created: false/);
  assert.doesNotMatch(cap, /activateStaffPortalAccess|provisionStaffAccess/);
  assert.match(domain, /employees/);
});
