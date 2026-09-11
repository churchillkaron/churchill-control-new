import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(file, "utf8");

const projects = read("lib/projects/runtime/ProjectsOperatorCapability.js");
const projectRead = read("lib/projects/runtime/ProjectVerificationReadCapability.js");
const people = read("lib/people/runtime/PeopleOperatorCapability.js");
const peopleRead = read("lib/people/runtime/PeopleEmployeeVerificationReadCapability.js");
const compliance = read("lib/compliance/runtime/ComplianceAssetOperatorCapability.js");
const complianceRead = read("lib/compliance/runtime/ComplianceAssetVerificationReadCapability.js");
const bank = read("lib/finance/bank-statements/capabilities/importBankStatement.js");
const bankRead = read("lib/finance/bank-statements/capabilities/readBankStatementImport.js");

test("project creation binds returned project id to exact entity read", () => {
  assert.match(projects, /projects\.projects\.read/);
  assert.match(projects, /project_id: \["project\.id"\]/);
  assert.match(projectRead, /required: \["project_id"\]/);
  assert.match(projectRead, /\.eq\("entity_id", context\.entityId\)\.eq\("id", projectId\)/);
});
test("employee creation verifies employee plus selected-entity employment", () => {
  assert.match(people, /people\.employees\.read/);
  assert.match(people, /staff_id: \["employee\.id"\]/);
  assert.match(peopleRead, /employee_employment_assignments/);
  assert.match(peopleRead, /\.eq\("entity_id", entityId\)\.eq\("staff_id", staffId\)/);
});

test("compliance asset creation binds exact scoped asset", () => {
  assert.match(compliance, /compliance\.assets\.read/);
  assert.match(compliance, /asset_id: \["asset\.id"\]/);
  assert.match(complianceRead, /required: \["asset_id"\]/);
  assert.match(complianceRead, /\.eq\("entity_id", entityId\)\.eq\("id", assetId\)/);
});

test("bank statement import binds returned import id to exact read", () => {
  assert.match(bank, /finance\.bank_statements\.read/);
  assert.match(bank, /statement_import_id: \["statement_import_id", "record\.id"\]/);
  assert.match(bankRead, /required: \["statement_import_id"\]/);
  assert.match(bankRead, /queryFields: \["statement_import_id"\]/);
});
