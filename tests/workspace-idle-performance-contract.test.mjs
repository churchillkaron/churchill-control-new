import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('Business Partner does not permanently poll live execution while idle', () => {
  const dock = read('components/operator/HomeAvantiqoIntelligenceDock.jsx');
  assert.match(dock, /if \(recentLiveExecution\(next\)\) \{\s*timer = window\.setTimeout\(checkForActiveExecution, LIVE_POLL_MS\);/s);
  assert.doesNotMatch(dock, /window\.setTimeout\(poll, LIVE_POLL_MS\)/);
  assert.doesNotMatch(dock, /const LIVE_POLL_MS = 900/);

  const intelligence = read('components/operator/HomeAvantiqoIntelligence.jsx');
  assert.match(intelligence, /if \(!busy \|\| !organizationId \|\| !activeRequestStartedAt\)/);
  assert.match(intelligence, /window\.setInterval\(loadLiveExecution, 2500\)/);
});

test('workspace shell navigation does not prefetch every visible domain', () => {
  for (const path of [
    'components/workspace/WorkspaceNavigationRail.jsx',
    'components/workspace/WorkspaceTopBar.jsx',
    'components/workspace/WorkspaceModuleGrid.jsx',
    'app/(system)/workspace/[organizationId]/page.jsx',
  ]) {
    const source = read(path);
    const links = [...source.matchAll(/<Link\b([^>]*)>/g)];
    assert.ok(links.length > 0, `${path} should contain navigation links`);
    for (const match of links) {
      assert.match(match[1], /prefetch=\{false\}/, `${path} has an eager-prefetch Link: ${match[0]}`);
    }
  }
});

test('autonomous watch is event driven instead of permanent polling', () => {
  const source = read('components/operator/AutonomousWatchAlertBridge.jsx');
  assert.doesNotMatch(source, /setInterval\(/);
  assert.match(source, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", onVisibility\)/);
});

test('workspace bootstrap reuses authenticated user and bounds retries', () => {
  const access = read('lib/platform/security/requireOrganizationAccess.js');
  assert.match(access, /user: suppliedUser = null/);
  assert.match(access, /suppliedUser\?\.id \? suppliedUser : await authenticatedUser\(request\)/);

  const resolver = read('lib/people/runtime/resolveAuthenticatedStaffContext.js');
  assert.match(resolver, /requireOrganizationAccess\(\{[\s\S]*?user,[\s\S]*?requiredPermission/);

  const provider = read('app/providers/BusinessContextProvider.jsx');
  assert.match(provider, /attempts: 3/);
  assert.match(provider, /timeoutMs: 7000/);
  assert.doesNotMatch(provider, /attempts: 8/);
});

test('Intelligence prewarm is delayed and deduplicated per organization session', () => {
  const source = read('components/operator/HomeAvantiqoIntelligence.jsx');
  assert.match(source, /avantiqo:intelligence-prewarm:/);
  assert.match(source, /sessionStorage\.getItem\(storageKey\)/);
  assert.match(source, /window\.setTimeout\(startPrewarm, 1500\)/);
});
