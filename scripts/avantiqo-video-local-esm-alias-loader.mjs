import { access } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolvePath(process.env.AVANTIQO_VIDEO_ALIAS_ROOT || process.cwd());

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveCandidates(base, label) {
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.json`,
    resolvePath(base, "index.js"),
    resolvePath(base, "index.mjs"),
    resolvePath(base, "index.cjs"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`AVANTIQO_VIDEO_LOCAL_ESM_NOT_FOUND:${label}`);
}

async function resolveAlias(specifier) {
  const relative = specifier.slice(2);
  return resolveCandidates(resolvePath(ROOT, relative), specifier);
}

async function resolveRelative(specifier, context) {
  if (!context.parentURL?.startsWith("file:")) return null;
  const parentPath = fileURLToPath(context.parentURL);
  return resolveCandidates(resolvePath(dirname(parentPath), specifier), specifier);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return {
      url: await resolveAlias(specifier),
      shortCircuit: true,
    };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/[.][A-Za-z0-9]+(?:[?#].*)?$/.test(specifier)) {
      return {
        url: await resolveRelative(specifier, context),
        shortCircuit: true,
      };
    }
    throw error;
  }
}
