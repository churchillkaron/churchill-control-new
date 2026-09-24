import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/platform/service-runtime/execution/ServiceExecutionRuntime.js', import.meta.url), 'utf8');
test('service execution imports the creative provider execution claim runtime it invokes', () => {
  assert.match(source, /import\s*\{\s*CreativeProviderExecutionClaimRuntime,?\s*\}\s*from "\.\/CreativeProviderExecutionClaimRuntime"/s);
  assert.match(source, /CreativeProviderExecutionClaimRuntime\.claim\(/);
  assert.match(source, /CreativeProviderExecutionClaimRuntime\.submitted\(/);
  assert.match(source, /CreativeProviderExecutionClaimRuntime\.completed\(/);
});
