import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const routeRead = read('lib/operator/runtime/OperatorAuthenticatedRouteReadCapability.js');
const documents = read('lib/documents/runtime/DocumentsDomainRuntime.js');
const projects = read('lib/projects/runtime/ProjectsRuntime.js');
const people = read('lib/people/runtime/PeopleOperatorDomainRuntime.js');
const compliance = read('lib/compliance/runtime/ComplianceDomainRuntime.js');
const domains = read('lib/ubte/runtime/domains/DomainRuntimeRegistry.js');
const creativeProject = read('lib/creative/studio/capabilities/inspectStudioProject.js');
const creativeDirection = read('lib/creative/studio/capabilities/inspectStudioDirection.js');
const creativeProduction = read('lib/creative/production/capabilities/inspectCreativeProduction.js');

test('authenticated route reads are fixed-origin GET-only and server scoped', () => {
  assert.match(routeRead, /new URL\(endpoint, origin\)/);
  assert.match(routeRead, /method: "GET"/);
  assert.match(routeRead, /url\.searchParams\.set\("organizationId", organizationId\)/);
  assert.match(routeRead, /context\?\.entityId/);
  assert.match(routeRead, /context\?\.periodId/);
  assert.match(routeRead, /queryFields/);
  assert.match(routeRead, /request\?\.headers\?\.get\?\.\("cookie"\)/);
});

test('documents projects people and compliance expose real read actions', () => {
  assert.match(documents, /files:\s*\{[\s\S]*read:/);
  assert.match(projects, /projects:\s*\{[\s\S]*read:/);
  assert.match(people, /employees:\s*\{[\s\S]*read:/);
  assert.match(compliance, /records:\s*\{\s*read:/);
  assert.match(documents, /endpoint: "\/api\/documents"/);
  assert.match(projects, /endpoint: "\/api\/workspace\/projects\/command-center"/);
  assert.match(people, /endpoint: "\/api\/people\/directory"/);
  assert.match(compliance, /endpoint: "\/api\/workspace\/compliance\/records"/);
});

test('domain creates remain lazy so read discovery does not require write dependencies', () => {
  for (const source of [documents, projects, people, compliance]) {
    assert.match(source, /await import\(/);
  }
});

test('creative fallback exposes only verified inspection reads', () => {
  assert.match(domains, /OPERATOR_CREATIVE_RUNTIME_DISCOVERY_FALLBACK/);
  assert.match(domains, /inspectStudioProject/);
  assert.match(domains, /inspectStudioDirection/);
  assert.match(domains, /inspectCreativeProduction/);
});

test('creative inspection modules lazy-load database-backed execution runtimes', () => {
  assert.doesNotMatch(creativeProject, /^import .*OperatorCreativeProjectReferenceRuntime/m);
  assert.doesNotMatch(creativeProduction, /^import .*ProductionRuntime/m);
  assert.doesNotMatch(creativeDirection, /^import .*ShotRuntime/m);
  assert.match(creativeProject, /await import\(/);
  assert.match(creativeProduction, /await Promise\.all\(/);
  assert.match(creativeDirection, /await Promise\.all\(/);
});
