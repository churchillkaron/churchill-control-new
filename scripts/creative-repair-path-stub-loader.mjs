// Loader that swaps the reasoning transport for a scripted stub.
//
// Every defect found in the Creative director this cycle lived on a repair path:
// the plan unwrapped by guessing key names, the contract repair that silently
// discarded its own output, a repaired list entry that erased the entry it revised,
// and a ReferenceError on the tribunal's most common rejection path. None of them
// were reachable without a model call, so each one was found by paying for a live
// benchmark run and reading the wreckage.
//
// They are all deterministic given the model's output. This loader redirects
// ServiceExecutionRuntime to a stub so the repair paths can be driven with scripted
// responses, which makes the whole class of defect testable for free.
//
// Test-only. Nothing in the application imports it.

import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolve as resolveAlias } from "./next-alias-loader.mjs";

const rootUrl = pathToFileURL(`${process.cwd()}${path.sep}`).href;
function stub(name) {
  return new URL(`scripts/${name}`, rootUrl).href;
}

// The organization catalogue is stubbed alongside the transport so the test needs no
// database and can run anywhere, including CI where no Supabase instance is
// reachable.
const REDIRECTS = [
  ["/execution/ServiceExecutionRuntime", stub("creative-repair-path-stub-transport.mjs")],
  ["/runtime/OrganizationServiceRuntime", stub("creative-repair-path-stub-services.mjs")],
];

export async function resolve(specifier, context, nextResolve) {
  for (const [suffix, url] of REDIRECTS) {
    if (specifier.endsWith(suffix)) return { url, shortCircuit: true };
  }
  return resolveAlias(specifier, context, nextResolve);
}
