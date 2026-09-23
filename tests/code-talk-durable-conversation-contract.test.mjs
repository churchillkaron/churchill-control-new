import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/talk/route.js", import.meta.url), "utf8");

test("Code Talk uses organization-scoped durable intelligence memory without requiring Party identity", () => {
  assert.match(route, /from\("intelligence_memories"\)/);
  assert.match(route, /MEMORY_SCOPE = "code_studio_talk_history"/);
  assert.match(route, /MEMORY_KEY = "primary"/);
  assert.match(route, /onConflict: "organization_id,memory_scope,memory_key"/);
  assert.doesNotMatch(route, /loadOrCreateIntelligenceConversation/);
  assert.doesNotMatch(route, /partyId/);
});

test("Code Talk hydrates durable user and assistant turns from the server", () => {
  assert.match(ide, /\/api\/operator\/code\/talk\?organizationId=/);
  assert.match(ide, /persistedTalkTurnIdsRef/);
  assert.match(ide, /talkServerHydratedRef/);
  assert.match(ide, /persisted: true/);
  assert.match(ide, /slice\(-120\)/);
});

test("new permanent Talk turns persist sequentially while live narration stays ephemeral", () => {
  assert.match(ide, /for \(let index = 0; index < durableTurns\.length; index \+= 1\)/);
  assert.match(ide, /await fetch\("\/api\/operator\/code\/talk"/);
  assert.match(ide, /client_turn_id: turnId/);
  assert.match(ide, /!isTransientRecoveryTalkTurn\(turn\)/);
  assert.match(ide, /id: `user-\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(ide, /const summaryId = `mission-summary-\$\{missionId\}`/);
  assert.match(ide, /\{liveTalkActive \? <div/);
});

test("browser fallback retains substantial Talk history", () => {
  assert.match(ide, /\.slice\(-100\)/);
  assert.match(ide, /\.slice\(-40\)/);
});
