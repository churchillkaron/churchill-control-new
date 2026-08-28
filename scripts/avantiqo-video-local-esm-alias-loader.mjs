import { access } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolvePath(process.env.AVANTIQO_VIDEO_ALIAS_ROOT || process.cwd());

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveAlias(specifier) {
  const relative = specifier.slice(2);
  const base = resolvePath(ROOT, relative);
  const candidates = [
    base,
    `${base}.js`,
    `${base}.mjs`,
    `${base}.cjs`,
    resolvePath(base, "index.js"),
    resolvePath(base, "index.mjs"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`AVANTIQO_VIDEO_LOCAL_ALIAS_NOT_FOUND:${specifier}`);
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return {
      url: await resolveAlias(specifier),
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
