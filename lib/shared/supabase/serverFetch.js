const capturedFetch =
  typeof globalThis.fetch === "function"
    ? globalThis.fetch.bind(globalThis)
    : null;

export function supabaseNoStoreFetch(input, init = undefined) {
  if (!capturedFetch) {
    throw new Error("SUPABASE_SERVER_FETCH_UNAVAILABLE");
  }

  return capturedFetch(input, {
    ...(init || {}),
    cache: "no-store",
  });
}

export const SUPABASE_SERVER_FETCH_CONTRACT = Object.freeze({
  contract: "SUPABASE_SERVER_NO_STORE_FETCH_V1",
  cache: "no-store",
  captured_base_fetch: true,
});
