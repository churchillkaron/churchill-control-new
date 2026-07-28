import { pathToFileURL } from "node:url";
import path from "node:path";

const rootUrl = pathToFileURL(`${process.cwd()}${path.sep}`).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const candidate = new URL(relative, rootUrl);

    try {
      return await nextResolve(candidate.href, context);
    } catch (error) {
      if (!path.extname(relative)) {
        return nextResolve(`${candidate.href}.js`, context);
      }
      throw error;
    }
  }

  return nextResolve(specifier, context);
}
