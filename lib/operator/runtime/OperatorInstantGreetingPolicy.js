// Text greetings must follow the same owned Intelligence path as every other
// user turn. A local canned answer created a second "fast" personality and
// could be surfaced by stale Voice listeners. Keep the policy entry point for
// compatibility, but never bypass governed Intelligence.
export function resolveOperatorInstantGreeting() {
  return null;
}

export const OperatorInstantGreetingPolicy = Object.freeze({
  resolve: resolveOperatorInstantGreeting,
});
