import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const FILES = Object.freeze({
  service: "lib/people/employees/employeeDirectoryService.js",
  employment: "lib/people/employees/employeeEmploymentLifecycleService.js",
  api: "app/api/people/directory/route.js",
  ui: "app/(system)/workspace/[organizationId]/people/directory/page.jsx",
  activation: "lib/people/identity/activateStaffPortalAccess.js",
  registry: "lib/people/registry/peopleWorkspaceRegistry.js",
});

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing People employee directory release file: ${relativePath}`);
  }

  return fs.readFileSync(absolutePath, "utf8");
}

function requireMatch(source, pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} is missing a required People employee contract`);
  }
}

function requireNoMatch(source, pattern, label) {
  if (pattern.test(source)) {
    throw new Error(`${label} contains a forbidden People employee contract`);
  }
}

const source = Object.fromEntries(
  Object.entries(FILES).map(([key, relativePath]) => [key, read(relativePath)])
);

requireMatch(
  source.registry,
  /id:\s*"employees"[\s\S]*route:\s*"\/people\/directory"/,
  "People registry employee workspace"
);

for (const contract of [
  /createEmployeeWithEmployment/,
  /loadEmployeeDirectoryWithEmployment/,
  /setEmployeeActiveWithEmployment/,
  /transferEmployeeLegalEntity/,
  /updateEmployeeRecord/,
]) {
  requireMatch(
    source.api,
    contract,
    "People Directory API employee lifecycle boundary"
  );
}

requireMatch(
  source.api,
  /@\/lib\/people\/employees\/employeeEmploymentLifecycleService/,
  "People Directory API canonical employment lifecycle import"
);
requireMatch(
  source.api,
  /@\/lib\/people\/employees\/employeeDirectoryService/,
  "People Directory API canonical profile service import"
);
requireNoMatch(
  source.api,
  /@\/lib\/shared\/supabase\/admin|\.from\("staff_accounts"\)|\.from\("employee_compensation_profiles"\)/,
  "People Directory API direct persistence bypass"
);
requireMatch(
  source.api,
  /action === "create_employee"[\s\S]*createEmployeeWithEmployment/,
  "People Directory employee creation action"
);
requireMatch(
  source.api,
  /action === "send_activation"[\s\S]*activateStaffPortalAccess/,
  "People Directory separate portal activation"
);
requireMatch(
  source.api,
  /action === "update_profile"[\s\S]*updateEmployeeRecord/,
  "People Directory profile update action"
);
requireMatch(
  source.api,
  /action === "set_active"[\s\S]*setEmployeeActiveWithEmployment/,
  "People Directory employment status action"
);
requireMatch(
  source.api,
  /action === "transfer_entity"[\s\S]*transferEmployeeLegalEntity/,
  "People Directory legal employer transfer action"
);
requireNoMatch(
  source.api,
  /PAYROLL_ADMIN/,
  "Payroll administration ownership of employee master"
);

for (const contract of [
  /createEmployeeRecord/,
  /loadEmployeeDirectory/,
  /setEmployeeActiveStatus/,
]) {
  requireMatch(
    source.employment,
    contract,
    "People employment lifecycle delegation to employee master"
  );
}
requireMatch(
  source.employment,
  /assignEmployeeEmploymentEntity/,
  "People employment lifecycle legal employer assignment"
);
requireMatch(
  source.employment,
  /endEmployeeEmploymentAssignment/,
  "People employment lifecycle legal employer closure"
);

requireMatch(
  source.service,
  /\.from\("staff_accounts"\)[\s\S]*\.eq\("active_organization_id", organizationId\)/,
  "Employee staff organization scope"
);
requireMatch(
  source.service,
  /\.from\("parties"\)[\s\S]*\.eq\("organization_id", organizationId\)/,
  "Employee Party organization scope"
);
requireMatch(
  source.service,
  /\.from\("organization_users"\)[\s\S]*\.eq\("organization_id", organizationId\)/,
  "Employee membership organization scope"
);
requireMatch(
  source.service,
  /\.from\("party_relationships"\)[\s\S]*relationship_type[\s\S]*"employee"/,
  "Employee Party relationship ownership"
);
requireMatch(
  source.service,
  /role:\s*"STAFF"[\s\S]*ensureMembership\([\s\S]*role:\s*"STAFF"/,
  "Industry-neutral employee membership bootstrap"
);
requireNoMatch(
  source.service,
  /role:\s*"(?:WAITER|BAR|KITCHEN|ACCOUNTING)"/,
  "Industry-specific employee access bootstrap"
);
requireMatch(
  source.service,
  /Portal-linked employee email changes require an identity email-change workflow/,
  "Portal identity email mutation guard"
);
requireMatch(
  source.service,
  /You cannot deactivate your own employee account/,
  "Employee self-deactivation guard"
);
requireMatch(
  source.service,
  /isOwnerLevelRole\(staffRole\)[\s\S]*isOwnerLevelRole\(membership\?\.role\)/,
  "Employee owner detection across staff and membership roles"
);
requireMatch(
  source.service,
  /The final organization owner cannot be deactivated/,
  "Final organization owner protection"
);
requireMatch(
  source.service,
  /update\(\{ status: active \? "active" : "inactive" \}\)/,
  "Employee membership status lifecycle"
);
requireMatch(
  source.service,
  /closeEmployeeRelationships\([\s\S]*partyId:\s*staff\.party_id/,
  "Employee relationship close lifecycle"
);
requireNoMatch(
  source.service,
  /auth\.admin\.deleteUser|resetPasswordForEmail|createUser\(/,
  "Employee master Auth identity mutation"
);
requireNoMatch(
  source.service,
  /\.catch\(\(\) => null\)/,
  "Employee service query-builder Promise catch cleanup"
);

requireMatch(
  source.activation,
  /resetPasswordForEmail[\s\S]*staffPortalAccessStatus/,
  "Dedicated staff portal activation boundary"
);

requireMatch(
  source.ui,
  /Employee Directory[\s\S]*New employee[\s\S]*Open compensation/,
  "Employee Directory canonical UI"
);
requireMatch(
  source.ui,
  /action:\s*"create_employee"[\s\S]*action:\s*"update_profile"[\s\S]*action:\s*"set_active"/,
  "Employee Directory lifecycle actions"
);
requireMatch(
  source.ui,
  /action:\s*"send_activation"/,
  "Employee Directory portal setup action"
);
requireNoMatch(
  source.ui,
  /\/api\/people\/compensation|saveCompensation|payrollFrequency|monthlySalary|hourlyRate|bankName|bankAccount/,
  "Employee Directory embedded compensation editing"
);
requireNoMatch(
  source.ui,
  /currency:\s*"THB"|value=\{form\.currency\}|Payroll frequency/,
  "Employee Directory payroll jurisdiction ownership"
);
requireNoMatch(
  source.ui,
  /<option value="WAITER"|<option value="BAR"|<option value="KITCHEN"/,
  "Employee Directory industry-specific role selector"
);

console.log(
  "PEOPLE_EMPLOYEE_DIRECTORY_RELEASE_AUDIT=PASS"
);
console.log(
  "EMPLOYEE_MASTER_OWNER=PEOPLE_DIRECTORY_SERVICE"
);
console.log(
  "EMPLOYEE_EMPLOYMENT_LIFECYCLE=PEOPLE_EMPLOYMENT_SERVICE"
);
console.log(
  "EMPLOYEE_SCOPE=ORGANIZATION_PARTY_MEMBERSHIP"
);
console.log(
  "EMPLOYEE_PORTAL_ACTIVATION=SEPARATE_AUTH_BOUNDARY"
);
console.log(
  "EMPLOYEE_COMPENSATION=DEDICATED_PAYROLL_WORKSPACE"
);
console.log(
  "EMPLOYEE_DOMAIN_PERMISSIONS=SEPARATE_DOMAIN_ROLE_SYSTEMS"
);
