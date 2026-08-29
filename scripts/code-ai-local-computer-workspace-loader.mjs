import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MISSION_RUNTIME_SUFFIX = "/lib/code/runtime/CodeAIMissionRuntime.js";
const SANDBOX_SPECIFIER = "./CodeWorkspaceSandboxRuntime.js";
const SHIM_URL = new URL("./code-ai-local-computer-workspace-shim.mjs", import.meta.url).href;
const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const ALIAS_PREFIX = "@/";
const ALIAS_CANDIDATE_SUFFIXES = Object.freeze(["", ".js", ".mjs", ".json"]);

function fileCandidate(value) {
  try {
    return existsSync(value) && statSync(value).isFile();
  } catch {
    return false;
  }
}

function resolveRepositoryAlias(specifier) {
  if (!String(specifier).startsWith(ALIAS_PREFIX)) return null;
  const relative = String(specifier).slice(ALIAS_PREFIX.length).replaceAll("\\", "/");
  if (!relative || relative.startsWith("/") || relative.split("/").includes("..")) {
    throw new Error(`CODE_AI_LOCAL_LOADER_ALIAS_INVALID:${specifier}`);
  }

  const base = path.resolve(REPOSITORY_ROOT, relative);
  if (base !== REPOSITORY_ROOT && !base.startsWith(`${REPOSITORY_ROOT}${path.sep}`)) {
    throw new Error(`CODE_AI_LOCAL_LOADER_ALIAS_OUTSIDE_REPOSITORY:${specifier}`);
  }

  for (const suffix of ALIAS_CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (fileCandidate(candidate)) return pathToFileURL(candidate).href;
  }
  for (const indexName of ["index.js", "index.mjs", "index.json"]) {
    const candidate = path.join(base, indexName);
    if (fileCandidate(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`CODE_AI_LOCAL_LOADER_ALIAS_NOT_FOUND:${specifier}`);
}

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier === SANDBOX_SPECIFIER &&
    String(context.parentURL || "").endsWith(MISSION_RUNTIME_SUFFIX)
  ) {
    return {
      url: SHIM_URL,
      shortCircuit: true,
    };
  }

  const aliasUrl = resolveRepositoryAlias(specifier);
  if (aliasUrl) {
    return {
      url: aliasUrl,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}

export const CodeAILocalComputerWorkspaceLoader = Object.freeze({
  repository_root: REPOSITORY_ROOT,
  resolveRepositoryAlias,
  shim_url: SHIM_URL,
});
