import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("lib/code/runtime/CodeWorkspaceLocalRuntime.js", "utf8");

test("local worktree creation uses a bounded cross-process repository lock", () => {
  assert.match(source, /WORKTREE_LOCK_WAIT_MS = 12_000/);
  assert.match(source, /WORKTREE_LOCK_STALE_MS = 120_000/);
  assert.match(source, /open\(lockPath, "wx"\)/);
  assert.match(source, /processStillAlive/);
  assert.match(source, /process\.kill\(value, 0\)/);
  assert.match(source, /owner\?\.pid && !processStillAlive\(owner\.pid\)/);
  assert.match(source, /CODE_AI_LOCAL_WORKTREE_LOCK_TIMEOUT/);
});

test("stuck worktree creation is bounded and retried once after stale metadata pruning", () => {
  assert.match(source, /Math\.min\(normalizedTimeout\(timeout_ms\), 15_000\)/);
  assert.match(source, /\["worktree", "prune", "--expire", "now"\]/);
  const adds = source.match(/\["worktree", "add", "--detach", workspaceRoot, target\]/g) || [];
  assert.equal(adds.length, 2);
});

test("worktree cleanup never mutates git metadata without the repository lock", () => {
  assert.match(source, /async function cleanupLocalWorktree/);
  assert.match(source, /releaseCleanupLock = await acquireRepositoryWorktreeLock\(sourceRoot\)/);
  assert.match(source, /metadata_cleanup_deferred: true/);
  assert.match(source, /await cleanupLocalWorktree\(sourceRoot, workspaceRoot\)/);
  assert.doesNotMatch(source, /acquireRepositoryWorktreeLock\(sourceRoot\)\.catch\(\(\) => null\)/);
});
