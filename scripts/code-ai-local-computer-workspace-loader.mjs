import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MISSION_RUNTIME_SUFFIX = "/lib/code/runtime/CodeAIMissionRuntime.js";
const SANDBOX_SPECIFIER = "./CodeWorkspaceSandboxRuntime.js";
const SHIM_URL = new URL("./code-ai-local-computer-workspace-shim.mjs", import.meta.url).href;
const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const ALIAS_PREFIX = "@/";
const CANDIDATE_SUFFIXES = Object.freeze(["", ".js", ".mjs", ".json"]);
const INDEX_CANDIDATES = Object.freeze(["index.js", "index.mjs", "index.json"]);

function fileCandidate(value) {
  try {
    return existsSync(value) && statSync(value).isFile();
  } catch {
    return false;
  }
}

function insideRepository(value) {
  const resolved = path.resolve(value);
  return resolved === REPOSITORY_ROOT || resolved.startsWith(`${REPOSITORY_ROOT}${path.sep}`);
}

function resolveFileCandidate(base) {
  if (!insideRepository(base)) return null;
  for (const suffix of CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (fileCandidate(candidate)) return pathToFileURL(candidate).href;
  }
  for (const indexName of INDEX_CANDIDATES) {
    const candidate = path.join(base, indexName);
    if (fileCandidate(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

function resolveRepositoryAlias(specifier) {
  if (!String(specifier).startsWith(ALIAS_PREFIX)) return null;
  const relative = String(specifier).slice(ALIAS_PREFIX.length).replaceAll("\\", "/");
  if (!relative || relative.startsWith("/") || relative.split("/").includes("..")) {
    throw new Error(`CODE_AI_LOCAL_LOADER_ALIAS_INVALID:${specifier}`);
  }

  const base = path.resolve(REPOSITORY_ROOT, relative);
  if (!insideRepository(base)) {
    throw new Error(`CODE_AI_LOCAL_LOADER_ALIAS_OUTSIDE_REPOSITORY:${specifier}`);
  }
  const resolved = resolveFileCandidate(base);
  if (resolved) return resolved;
  throw new Error(`CODE_AI_LOCAL_LOADER_ALIAS_NOT_FOUND:${specifier}`);
}

function resolveRepositoryRelative(specifier, parentURL) {
  const requested = String(specifier || "");
  if (!requested.startsWith("./") && !requested.startsWith("../")) return null;
  if (!String(parentURL || "").startsWith("file:")) return null;

  let parentPath;
  try {
    parentPath = fileURLToPath(parentURL);
  } catch {
    return null;
  }
  if (!insideRepository(parentPath)) return null;

  const cleanSpecifier = requested.split(/[?#]/, 1)[0];
  const base = path.resolve(path.dirname(parentPath), cleanSpecifier);
  if (!insideRepository(base)) {
    throw new Error(`CODE_AI_LOCAL_LOADER_RELATIVE_OUTSIDE_REPOSITORY:${specifier}`);
  }
  return resolveFileCandidate(base);
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

  const relativeUrl = resolveRepositoryRelative(specifier, context.parentURL);
  if (relativeUrl) {
    return {
      url: relativeUrl,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}

export const CodeAILocalComputerWorkspaceLoader = Object.freeze({
  repository_root: REPOSITORY_ROOT,
  resolveRepositoryAlias,
  resolveRepositoryRelative,
  shim_url: SHIM_URL,
});
