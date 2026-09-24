import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
const source = fs.readFileSync(new URL('../lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceLocalQueueRuntime.js', import.meta.url), 'utf8');
test('local queue defines the live-conversation runtime model used by front-lane routing', () => {
  assert.match(source, /const LIVE_CONVERSATION_RUNTIME_MODEL = "qwen3:1\.7b";/);
  assert.match(source, /taskMode === "code_live_conversation"\) return LIVE_CONVERSATION_RUNTIME_MODEL/);
});
