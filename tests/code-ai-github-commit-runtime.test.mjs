import assert from "node:assert/strict";
import test from "node:test";
import { commitVerifiedCodeMission } from "../lib/code/runtime/CodeGitHubCommitRuntime.js";

const BASE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TREE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NEW_TREE = "cccccccccccccccccccccccccccccccccccccccc";
const COMMIT = "dddddddddddddddddddddddddddddddddddddddd";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function missionState(baseCommit = BASE) {
  return {
    contract: "AVANTIQO_CODE_AI_MISSION_V1",
    repository_url: "https://github.com/churchillkaron/churchill-control-new",
    ref: "main",
    base_commit: baseCommit,
    status: "completed",
    blockers: [],
    verification: [{ passed: true }],
    source_changes: [
      { path: "lib/example.js", content: "export const value = 2;\n" },
      { path: "scripts/new-example.mjs", content: "console.log('ok');\n" },
    ],
  };
}

const env = {
  AVANTIQO_CODE_GITHUB_CONNECTOR: "github/avantiqo-code",
  AVANTIQO_CODE_GITHUB_REPOSITORIES: "churchillkaron/churchill-control-new",
  VERCEL_OIDC_TOKEN: "test-oidc-token",
};

test("Code AI GitHub commit is atomic, fast-forward only, and post-verified", async () => {
  const calls = [];
  let refReads = 0;
  const fetch_impl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith("https://api.vercel.com/v1/connect/token/")) {
      return response({ token: "github-installation-token" });
    }
    if (url.endsWith("/git/ref/heads/main") && (options.method || "GET") === "GET") {
      refReads += 1;
      return response({ object: { sha: refReads === 1 ? BASE : COMMIT } });
    }
    if (url.endsWith(`/git/commits/${BASE}`)) {
      return response({ sha: BASE, tree: { sha: TREE }, parents: [] });
    }
    if (url.endsWith(`/git/trees/${TREE}?recursive=1`)) {
      return response({
        truncated: false,
        tree: [{ path: "lib/example.js", mode: "100755", type: "blob" }],
      });
    }
    if (url.endsWith("/git/trees") && options.method === "POST") {
      const body = JSON.parse(options.body);
      assert.equal(body.base_tree, TREE);
      assert.equal(body.tree[0].path, "lib/example.js");
      assert.equal(body.tree[0].mode, "100755");
      assert.equal(body.tree[1].mode, "100644");
      return response({ sha: NEW_TREE }, 201);
    }
    if (url.endsWith("/git/commits") && options.method === "POST") {
      const body = JSON.parse(options.body);
      assert.deepEqual(body.parents, [BASE]);
      assert.equal(body.tree, NEW_TREE);
      return response({ sha: COMMIT }, 201);
    }
    if (url.endsWith("/git/refs/heads/main") && options.method === "PATCH") {
      const body = JSON.parse(options.body);
      assert.deepEqual(body, { sha: COMMIT, force: false });
      return response({ object: { sha: COMMIT } });
    }
    if (url.endsWith(`/git/commits/${COMMIT}`)) {
      return response({ sha: COMMIT, tree: { sha: NEW_TREE }, parents: [{ sha: BASE }] });
    }
    throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
  };

  const result = await commitVerifiedCodeMission({
    mission_state: missionState(),
    commit_message: "Verify atomic Code AI commit",
    env,
    fetch_impl,
  });

  assert.equal(result.success, true);
  assert.equal(result.commit_sha, COMMIT);
  assert.equal(result.previous_commit, BASE);
  assert.equal(result.force, false);
  assert.equal(result.verified, true);
  assert.ok(calls.some((call) => call.url.includes("github%2Favantiqo-code")));
});

test("Code AI GitHub commit refuses stale main before creating a tree", async () => {
  const moved = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
  let githubWrites = 0;
  const fetch_impl = async (url, options = {}) => {
    if (url.startsWith("https://api.vercel.com/v1/connect/token/")) {
      return response({ token: "github-installation-token" });
    }
    if (url.endsWith("/git/ref/heads/main")) {
      return response({ object: { sha: moved } });
    }
    if ((options.method || "GET") !== "GET") githubWrites += 1;
    throw new Error(`Unexpected request: ${url}`);
  };

  await assert.rejects(
    () => commitVerifiedCodeMission({
      mission_state: missionState(),
      commit_message: "Must not overwrite concurrent work",
      env,
      fetch_impl,
    }),
    /CODE_AI_GITHUB_BASE_COMMIT_MOVED_REPLAN_REQUIRED/,
  );
  assert.equal(githubWrites, 0);
});

test("Code AI GitHub commit stays inactive without repository allowlist", async () => {
  await assert.rejects(
    () => commitVerifiedCodeMission({
      mission_state: missionState(),
      commit_message: "Blocked without config",
      env: {
        AVANTIQO_CODE_GITHUB_CONNECTOR: "github/avantiqo-code",
        VERCEL_OIDC_TOKEN: "test-oidc-token",
      },
      fetch_impl: async () => { throw new Error("network must not be reached"); },
    }),
    /AVANTIQO_CODE_GITHUB_REPOSITORIES_REQUIRED/,
  );
});
