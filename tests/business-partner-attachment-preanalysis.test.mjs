import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync('app/api/operator/attachments/analyze/route.js','utf8');
const dock = readFileSync('components/operator/HomeAvantiqoIntelligenceDock.jsx','utf8');

test('uploaded attachments have a dedicated authenticated semantic pre-analysis endpoint', () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /loadConversationAttachmentSet/);
  assert.match(route, /analyzeConversationAttachments/);
  assert.match(route, /persistConversationAttachmentAnalysis/);
  assert.match(route, /AVANTIQO_ATTACHMENT_ANALYSIS_VERSION/);
  assert.match(route, /authorization_effect: "NONE"/);
  assert.doesNotMatch(route, /prepareBankStatementAttachment|prepareInventoryAttachment|routeAnalyzedAttachment/);
});

test('client starts understanding immediately after upload and reuses the same promise on send', () => {
  assert.match(dock, /beginDeveloperAttachmentAnalysis\(next\)/);
  assert.match(dock, /\/api\/operator\/attachments\/analyze/);
  assert.match(dock, /developerAttachmentAnalysisPromiseRef\.current = promise/);
  assert.match(dock, /await developerAttachmentAnalysisPromiseRef\.current\.catch/);
  assert.match(dock, /Understanding files…/);
  assert.match(dock, /Understood · next turn only/);
});

test('client mirrors the 60 MB aggregate preflight', () => {
  assert.match(dock, /MAX_DEVELOPER_TOTAL_BYTES = 60 \* 1024 \* 1024/);
  const total = dock.indexOf('if (totalBytes > MAX_DEVELOPER_TOTAL_BYTES)');
  const request = dock.indexOf('fetch("/api/operator/attachments"', total);
  assert.ok(total >= 0 && request > total);
});
