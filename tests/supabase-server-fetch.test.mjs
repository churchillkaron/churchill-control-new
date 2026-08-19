import assert from "node:assert/strict";
import test from "node:test";

const originalFetch = globalThis.fetch;

test("server Supabase fetch always bypasses Next data cache for binary writes", async () => {
  let observed = null;

  globalThis.fetch = async (input, init) => {
    observed = { input, init };
    return new Response("ok", { status: 200 });
  };

  try {
    const { supabaseNoStoreFetch } = await import(
      `../lib/shared/supabase/serverFetch.js?test=${Date.now()}`
    );
    const body = Buffer.from([0, 1, 2, 3]);

    await supabaseNoStoreFetch("https://example.test/storage/object", {
      method: "POST",
      body,
      cache: "force-cache",
      headers: { "content-type": "application/octet-stream" },
    });

    assert.equal(observed?.init?.cache, "no-store");
    assert.equal(observed?.init?.method, "POST");
    assert.strictEqual(observed?.init?.body, body);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
