import assert from "node:assert/strict";
import test from "node:test";
import {
  commitVerifiedCodeMission,
  recoverVerifiedCodeMissionCommit,
} from "../lib/code/runtime/CodeGitHubCommitRuntime.js";
import { attestCodeMissionState } from "../lib/code/runtime/CodeMissionAttestationRuntime.js";

const BASE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TREE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const NEW_TREE = "cccccccccccccccccccccccccccccccccccccccc";
const COMMIT = "dddddddddddddddddddddddddddddddddddddddd";
const LATER = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const ATTESTATION_SECRET = "test-code-ai-attestation-secret-that-is-long-enough";

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function unsignedMissionState(baseCommit = BASE) {
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
  AVANTIQO_CODE_MISSION_ATTESTATION_SECRET: ATTESTATION_SECRET,
  VERCEL_OIDC_TOKEN: "test-oidc-token",
};

function missionState(baseCommit = BASE) {
  return attestCodeMissionState(unsignedMissionState(baseCommit), { env });
}

function base64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

test("Code AI GitHub commit is atomic, fast-forward only, attested, and post-verified", async () => {
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

test("Code AI GitHub commit refuses stale main before creating a GitHub tree", async () => {
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

test("Code AI GitHub commit rejects tampered mission state before network access", async () => {
  const tampered = missionState();
  tampered.source_changes[0].content = "malicious replacement\n";
  let requests = 0;
  await assert.rejects(
    () => commitVerifiedCodeMission({
      mission_state: tampered,
      commit_message: "Must reject tampering",
      env,
      fetch_impl: async () => {
        requests += 1;
        throw new Error("network must not be reached");
      },
    }),
    /CODE_AI_MISSION_ATTESTATION_INVALID/,
  );
  assert.equal(requests, 0);
});

test("Code AI GitHub commit stays inactive without repository allowlist", async () => {
  const noAllowlistEnv = {
    ...env,
    AVANTIQO_CODE_GITHUB_REPOSITORIES: "",
  };
  await assert.rejects(
    () => commitVerifiedCodeMission({
      mission_state: attestCodeMissionState(unsignedMissionState(), { env: noAllowlistEnv }),
      commit_message: "Blocked without config",
      env: noAllowlistEnv,
      fetch_impl: async () => { throw new Error("network must not be reached"); },
    }),
    /AVANTIQO_CODE_GITHUB_REPOSITORIES_REQUIRED/,
  );
});

test("Code AI commit recovery stops at unchanged base without scanning history", async () => {
  const calls = [];
  const fetch_impl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith("https://api.vercel.com/v1/connect/token/")) {
      return response({ token: "github-installation-token" });
    }
    if (url.endsWith("/git/ref/heads/main")) {
      return response({ object: { sha: BASE } });
    }
    throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
  };

  await assert.rejects(
    () => recoverVerifiedCodeMissionCommit({
      mission_state: missionState(),
      env,
      fetch_impl,
    }),
    (error) => {
      assert.equal(error.message, "CODE_AI_GITHUB_RECOVERY_VERIFIED_COMMIT_NOT_FOUND");
      assert.equal(error.expected_base_commit, BASE);
      assert.equal(error.current_main_head, BASE);
      assert.equal(error.main_advanced_from_expected_base, false);
      assert.equal(error.recovery_history_limit, 50);
      return true;
    },
  );
  assert.equal(calls.filter((call) => call.url.includes("/commits?sha=main")).length, 0);
  assert.equal(calls.some((call) => (call.options.method || "GET") !== "GET"), true);
  assert.equal(
    calls.filter((call) => call.url.startsWith("https://api.github.com/")).every(
      (call) => (call.options.method || "GET") === "GET",
    ),
    true,
  );
});

test("Code AI commit recovery verifies exact paths and exact file contents without replay", async () => {
  const calls = [];
  const state = missionState();
  const expectedChanges = state.source_changes;
  const fetch_impl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith("https://api.vercel.com/v1/connect/token/")) {
      return response({ token: "github-installation-token" });
    }
    if (url.endsWith("/git/ref/heads/main")) {
      return response({ object: { sha: LATER } });
    }
    if (url.includes("/commits?sha=main&per_page=50")) {
      return response([
        { sha: LATER, parents: [{ sha: COMMIT }] },
        { sha: COMMIT, parents: [{ sha: BASE }] },
        { sha: BASE, parents: [] },
      ]);
    }
    if (url.includes(`/compare/${BASE}...${COMMIT}`)) {
      return response({
        files: expectedChanges.map((change) => ({ filename: change.path })),
      });
    }
    if (url.includes("/contents/lib/example.js?ref=")) {
      return response({
        type: "file",
        encoding: "base64",
        content: base64(expectedChanges[0].content),
      });
    }
    if (url.includes("/contents/scripts/new-example.mjs?ref=")) {
      return response({
        type: "file",
        encoding: "base64",
        content: base64(expectedChanges[1].content),
      });
    }
    if (url.endsWith(`/git/commits/${COMMIT}`)) {
      return response({
        sha: COMMIT,
        tree: { sha: NEW_TREE },
        parents: [{ sha: BASE }],
      });
    }
    throw new Error(`Unexpected request: ${options.method || "GET"} ${url}`);
  };

  const result = await recoverVerifiedCodeMissionCommit({
    mission_state: state,
    env,
    fetch_impl,
  });

  assert.equal(result.success, true);
  assert.equal(result.verified, true);
  assert.equal(result.recovered_from_attested_artifact, true);
  assert.equal(result.commit_sha, COMMIT);
  assert.equal(result.previous_commit, BASE);
  assert.equal(result.current_main_head, LATER);
  assert.equal(result.commit_is_current_main_head, false);
  assert.equal(result.main_advanced_after_commit, true);
  assert.equal(
    calls.filter((call) => call.url.startsWith("https://api.github.com/")).every(
      (call) => (call.options.method || "GET") === "GET",
    ),
    true,
  );
});

test("Code AI commit recovery rejects a candidate with an unexpected changed path and preserves moved-main evidence", async () => {
  const state = missionState();
  const fetch_impl = async (url) => {
    if (url.startsWith("https://api.vercel.com/v1/connect/token/")) {
      return response({ token: "github-installation-token" });
    }
    if (url.endsWith("/git/ref/heads/main")) {
      return response({ object: { sha: COMMIT } });
    }
    if (url.includes("/commits?sha=main&per_page=50")) {
      return response([{ sha: COMMIT, parents: [{ sha: BASE }] }]);
    }
    if (url.includes(`/compare/${BASE}...${COMMIT}`)) {
      return response({
        files: [
          { filename: "lib/example.js" },
          { filename: "scripts/new-example.mjs" },
          { filename: "lib/unexpected.js" },
        ],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  await assert.rejects(
    () => recoverVerifiedCodeMissionCommit({
      mission_state: state,
      env,
      fetch_impl,
    }),
    (error) => {
      assert.equal(error.message, "CODE_AI_GITHUB_RECOVERY_VERIFIED_COMMIT_NOT_FOUND");
      assert.equal(error.expected_base_commit, BASE);
      assert.equal(error.current_main_head, COMMIT);
      assert.equal(error.main_advanced_from_expected_base, true);
      assert.equal(error.recovery_history_limit, 50);
      return true;
    },
  );
});

test("Code AI commit recovery rejects a candidate whose resulting file content differs", async () => {
  const state = missionState();
  const fetch_impl = async (url) => {
    if (url.startsWith("https://api.vercel.com/v1/connect/token/")) {
      return response({ token: "github-installation-token" });
    }
    if (url.endsWith("/git/ref/heads/main")) {
      return response({ object: { sha: COMMIT } });
    }
    if (url.includes("/commits?sha=main&per_page=50")) {
      return response([{ sha: COMMIT, parents: [{ sha: BASE }] }]);
    }
    if (url.includes(`/compare/${BASE}...${COMMIT}`)) {
      return response({
        files: state.source_changes.map((change) => ({ filename: change.path })),
      });
    }
    if (url.includes("/contents/lib/example.js?ref=")) {
      return response({
        type: "file",
        encoding: "base64",
        content: base64("export const value = 999;\n"),
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  await assert.rejects(
    () => recoverVerifiedCodeMissionCommit({
      mission_state: state,
      env,
      fetch_impl,
    }),
    /CODE_AI_GITHUB_RECOVERY_VERIFIED_COMMIT_NOT_FOUND/,
  );
});
