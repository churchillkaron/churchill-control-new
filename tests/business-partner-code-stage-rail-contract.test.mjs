import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Code workspaces expose one shared progress feed without duplicate polling owners", async () => {
  const page = await source("app/(system)/workspace/[organizationId]/creative/code/page.jsx");
  const developerPage = await source("app/(system)/workspace/[organizationId]/creative/code/developer/page.jsx");
  const provider = await source("components/operator/CodeProgressFeedProvider.jsx");
  const studio = await source("components/creative/code/CreativeCodeStudio.jsx");
  const ide = await source("components/creative/code/AvantiqoCodeIDE.jsx");

  assert.match(page, /<CodeProgressFeedProvider organizationId=\{organizationId\}>/);
  assert.match(developerPage, /<CodeProgressFeedProvider organizationId=\{organizationId\}>/);
  assert.equal((page.match(/<CodeProgressFeedProvider organizationId=\{organizationId\}>/g) || []).length, 1);
  assert.equal((developerPage.match(/<CodeProgressFeedProvider organizationId=\{organizationId\}>/g) || []).length, 1);

  assert.match(studio, /useCodeProgressFeed\(\)/);
  assert.match(ide, /useCodeProgressFeed\(\)/);
  assert.doesNotMatch(studio, /\/api\/operator\/code\/progress/);
  assert.doesNotMatch(ide, /\/api\/operator\/code\/progress/);

  assert.equal((provider.match(/\/api\/operator\/code\/progress/g) || []).length, 1);
  assert.match(provider, /data-avantiqo-code-progress-poll-owner|CodeProgressFeedContext\.Provider/);
});
