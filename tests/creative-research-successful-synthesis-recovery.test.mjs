import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js', 'utf8');

test('successful settled synthesis is recovered only through current-contract validation', () => {
  assert.match(source, /matchingStructuredSynthesisUsages/);
  assert.match(source, /structuredResultFromUsage/);
  assert.match(source, /normalizeAndValidateResearch\(\{[\s\S]*priorUsage\.metadata\?\.provider_result/);
  assert.match(source, /validateEvidenceBinding\(recoveredValidation, dossier\)/);
  assert.match(source, /validateResolvedOrganization\(recoveredValidation, organizationIdentity\)/);
  assert.match(source, /if \(!structuredResult\) structuredResult = await awaitResearchExecution/);
});
