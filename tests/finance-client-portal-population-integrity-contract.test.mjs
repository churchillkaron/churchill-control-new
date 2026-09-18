import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const projection = read("lib/finance/practice/FinanceClientPortalProjection.js");
const route = read("app/api/public/finance/client-portal/[token]/route.js");
const page = read("app/client/accounting/[token]/page.jsx");

test("client portal work status uses complete engagement run and work-item populations", () => {
  const block = projection.slice(projection.indexOf("async function loadRunsAndWork"), projection.indexOf("async function loadDocumentsAndApprovals"));
  assert.match(projection, /fetchCompleteFinancePopulation/);
  assert.match(block, /Client portal engagement runs/);
  assert.match(block, /Client portal work items/);
  assert.match(block, /fetchCompleteByIds/);
  assert.doesNotMatch(block, /limit\(200\)|limit\(5000\)/);
});

test("client portal tax filing truth is complete rather than capped at 100", () => {
  const block = projection.slice(projection.indexOf("async function loadFilings"), projection.indexOf("async function loadMessages"));
  assert.match(block, /Client portal tax filings/);
  assert.match(block, /\.range\(from, to\)/);
  assert.doesNotMatch(block, /limit\(100\)/);
});

test("message display is bounded explicitly while total and read state remain complete", () => {
  const block = projection.slice(projection.indexOf("async function loadMessages"), projection.indexOf("export async function loadFinanceClientPortalProjection"));
  assert.match(block, /\{ count: "exact" \}/);
  assert.match(block, /has_more: total > rows\.length/);
  assert.match(block, /\.eq\("sender_type", "ACCOUNTING_FIRM"\)/);
  assert.match(block, /\.is\("read_by_client_at", null\)/);
  assert.doesNotMatch(block, /\.in\("id", unread\)/);
  assert.match(projection, /message_meta/);
});

test("open client requests use complete batched populations instead of 200 and 1000 row caps", () => {
  const block = route.slice(route.indexOf("async function loadRequests"), route.indexOf("async function exactRequestContext"));
  assert.match(route, /fetchCompleteFinancePopulation/);
  assert.match(block, /Client portal active request runs/);
  assert.match(block, /Client portal open requests/);
  assert.match(block, /completeByIds/);
  assert.doesNotMatch(block, /limit\(200\)|limit\(1000\)/);
});

test("portal summaries and UI expose exact message totals and any bounded display window", () => {
  assert.match(route, /projection\.message_meta\?\.total \?\? projection\.messages\.length/);
  assert.match(route, /message_meta: projection\.message_meta/);
  assert.match(page, /data\.summary\?\.messages \?\? data\.message_meta\?\.total/);
  assert.match(page, /Showing the latest/);
  assert.match(page, /Older history is retained securely/);
});
