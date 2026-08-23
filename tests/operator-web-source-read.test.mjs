import test from "node:test";
import assert from "node:assert/strict";

import {
  runOperatorWebSourceRead,
} from "../lib/platform/research/runtime/OperatorWebSourceReadRuntime.js";

async function rejectsWith(url, pattern) {
  await assert.rejects(
    () => runOperatorWebSourceRead({ payload: { url } }),
    pattern,
  );
}

test("blocks non-http schemes and URL credentials before network access", async () => {
  await rejectsWith("file:///etc/passwd", /PROTOCOL_BLOCKED/);
  await rejectsWith("https://user:pass@example.com/", /URL_CREDENTIALS_BLOCKED/);
});

test("blocks nonstandard ports before network access", async () => {
  await rejectsWith("https://example.com:8443/docs", /NONSTANDARD_PORT_BLOCKED/);
});

test("blocks loopback and local hostnames", async () => {
  await rejectsWith("http://127.0.0.1/", /PRIVATE_ADDRESS_BLOCKED/);
  await rejectsWith("http://localhost/", /HOST_BLOCKED/);
  await rejectsWith("http://[::1]/", /PRIVATE_ADDRESS_BLOCKED/);
});
