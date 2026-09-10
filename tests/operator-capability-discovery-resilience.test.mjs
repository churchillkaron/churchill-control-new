import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const domainRegistry = fs.readFileSync(
  new URL('../lib/ubte/runtime/domains/DomainRuntimeRegistry.js', import.meta.url),
  'utf8',
);
const listCapability = fs.readFileSync(
  new URL('../lib/operations/capabilities/createOperationsListCapability.js', import.meta.url),
  'utf8',
);
const commandCapability = fs.readFileSync(
  new URL('../lib/operations/capabilities/createOperationsCommandCapability.js', import.meta.url),
  'utf8',
);
const research = fs.readFileSync(
  new URL('../lib/platform/capabilities/createOperatorWebResearchCapability.js', import.meta.url),
  'utf8',
);
const compare = fs.readFileSync(
  new URL('../lib/platform/capabilities/createOperatorResearchCompareCapability.js', import.meta.url),
  'utf8',
);

test('registry-backed domains survive hand-written runtime discovery failure', () => {
  assert.match(domainRegistry, /OPERATOR_HAND_WRITTEN_DOMAIN_RUNTIME_DISCOVERY_UNAVAILABLE/);
  assert.match(domainRegistry, /if \(!ownRuntime\) return bridgedRuntime/);
});

test('operations discovery does not eagerly import database-backed server api', () => {
  assert.doesNotMatch(listCapability, /^import \{ serverOperationsApi \}/m);
  assert.doesNotMatch(commandCapability, /^import \{ serverOperationsApi \}/m);
  assert.match(listCapability, /await import\([\s\S]*createServerOperationsApi/);
  assert.match(commandCapability, /await import\([\s\S]*createServerOperationsApi/);
});

test('platform research remains discoverable through credential-independent fallback', () => {
  assert.match(domainRegistry, /OPERATOR_PLATFORM_RUNTIME_DISCOVERY_FALLBACK/);
  assert.match(domainRegistry, /research_source/);
  assert.match(domainRegistry, /research_compare/);
});

test('research execution runtimes are lazy-loaded after capability discovery', () => {
  assert.doesNotMatch(research, /^import\s+\{[^\n]*runOperatorMechanismResearch[^\n]*\}\s+from/m);
  assert.doesNotMatch(compare, /^import\s+\{[^\n]*compareOperatorResearchEvidence[^\n]*\}\s+from/m);
  assert.match(research, /await import\([\s\S]*OperatorMechanismResearchRuntime/);
  assert.match(compare, /await import\([\s\S]*OperatorResearchEvidenceComparisonRuntime/);
});
