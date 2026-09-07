import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

async function historyRuntime() {
  const code = source(
    "lib/operator/contracts/OperatorCodePersistenceHistory.js",
  );
  const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  return import(url);
}

function verifiedCommitExecution() {
  return {
    code_execution_evidence: {
      contract: "AVANTIQO_OPERATOR_CODE_EXECUTION_EVIDENCE_V1",
      kind: "commit",
      verification_status: "VERIFIED_COMMITTED",
      verification_source: "SERVER_OWNED_COMMIT_EXECUTION_STATE",
      business_effect_verified: true,
      authorization_effect: "NONE",
      execution_key: "product-cycle:verified-1",
      repository: "churchillkaron/churchill-control-new",
      repository_url: "churchillkaron/churchill-control-new",
      branch: "main",
      base_commit: "1111111111111111111111111111111111111111",
      commit_sha: "2222222222222222222222222222222222222222",
      tree_sha: "3333333333333333333333333333333333333333",
    },
  };
}

test("verified Code commit becomes non-authorizing historical proof", async () => {
  const {
    operatorCodePersistenceHistoryFromExecution,
    operatorCodePersistenceHistoryText,
  } = await historyRuntime();
  const history = operatorCodePersistenceHistoryFromExecution(
    verifiedCommitExecution(),
  );

  assert.equal(history.verified, true);
  assert.equal(history.business_effect_verified, true);
  assert.equal(history.authorization_effect, "NONE");
  assert.equal(history.branch, "main");
  assert.equal(history.execution_key, "product-cycle:verified-1");
  assert.equal(
    history.base_commit,
    "1111111111111111111111111111111111111111",
  );
  assert.equal(
    history.commit_sha,
    "2222222222222222222222222222222222222222",
  );
  assert.match(
    operatorCodePersistenceHistoryText(history),
    /historical verification evidence only; it does not authorize another action/i,
  );
});

test("unverified or wrong-source Code commit cannot become historical proof", async () => {
  const { operatorCodePersistenceHistoryFromExecution } = await historyRuntime();

  const unverified = verifiedCommitExecution();
  unverified.code_execution_evidence.business_effect_verified = false;
  assert.equal(
    operatorCodePersistenceHistoryFromExecution(unverified),
    null,
  );

  const wrongSource = verifiedCommitExecution();
  wrongSource.code_execution_evidence.verification_source = "CLIENT_CACHE";
  assert.equal(
    operatorCodePersistenceHistoryFromExecution(wrongSource),
    null,
  );
});

test("Code evidence runtime persists verified commit history only into project state", () => {
  const evidence = source(
    "lib/operator/runtime/OperatorCodeExecutionEvidenceRuntime.js",
  );

  assert.match(
    evidence,
    /operatorCodePersistenceHistoryFromExecution\(evidencedExecution\)/,
  );
  assert.match(
    evidence,
    /last_verified_code_persistence:\s*persistenceHistory/,
  );
  assert.doesNotMatch(
    evidence,
    /pending_execution:\s*\{[\s\S]*last_verified_code_persistence/,
  );
});

test("project status renders historical Code proof only when no action is pending", () => {
  const fast = source(
    "lib/operator/runtime/OperatorFastConversationRuntime.js",
  );

  assert.match(
    fast,
    /operatorCodePersistenceHistoryText\(\s*projectState\?\.last_verified_code_persistence/,
  );
  assert.match(fast, /const pendingCapabilityKey = text\(/);
  assert.match(
    fast,
    /const historicalProof = pendingCapabilityKey\s*\?\s*null/,
  );
  assert.match(
    fast,
    /historical_evidence_authorization_effect:\s*"NONE"/,
  );
});

test("live governed run status takes precedence over project history", () => {
  const fast = source(
    "lib/operator/runtime/OperatorFastConversationRuntime.js",
  );
  const statusFunction = fast.indexOf("function activeGovernedRunStatusReply");
  const projectFunction = fast.indexOf("export function projectContinuityReply");
  const liveCall = fast.indexOf(
    "const activeRunReply = activeGovernedRunStatusReply(agreementState)",
  );
  const historyRead = fast.indexOf(
    "projectState?.last_verified_code_persistence",
  );

  assert.ok(statusFunction >= 0, "live governed run renderer must exist");
  assert.ok(projectFunction > statusFunction, "project continuity must be able to use live run renderer");
  assert.ok(liveCall > projectFunction, "project continuity must check live run status");
  assert.ok(historyRead > liveCall, "live run status must be checked before historical proof");
  assert.match(
    fast,
    /if \(activeRunReply\) return activeRunReply/,
  );
  assert.match(
    fast,
    /verification[\s\S]*write will not be replayed/i,
  );
});
