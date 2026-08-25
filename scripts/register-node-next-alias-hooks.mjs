import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.cwd();

function fileCandidate(basePath) {
  const candidates = [
    basePath,
    `${basePath}.js`,
    `${basePath}.mjs`,
    `${basePath}.cjs`,
    resolvePath(basePath, "index.js"),
    resolvePath(basePath, "index.mjs"),
    resolvePath(basePath, "index.cjs"),
  ];

  for (const candidate of candidates) {
    try {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

function mappedPath(specifier, parentURL) {
  if (specifier.startsWith("@/")) {
    return fileCandidate(resolvePath(ROOT, specifier.slice(2)));
  }

  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    parentURL?.startsWith("file:")
  ) {
    const parentPath = fileURLToPath(parentURL);
    return fileCandidate(resolvePath(dirname(parentPath), specifier));
  }

  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const mapped = mappedPath(specifier, context.parentURL);
    if (mapped) {
      return {
        url: pathToFileURL(mapped).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

console.log("AVANTIQO_NODE_NEXT_ALIAS_HOOKS=ACTIVE");
