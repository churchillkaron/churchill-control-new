import path from "node:path";
import { pathToFileURL } from "node:url";

const rootUrl = pathToFileURL(`${process.cwd()}${path.sep}`).href;
const extensionCandidates = [".js", ".mjs", ".cjs"];

async function resolveFileUrl(candidate, context, nextResolve) {
  try {
    return await nextResolve(candidate.href, context);
  } catch (originalError) {
    const pathname = candidate.pathname || "";
    if (path.extname(pathname)) throw originalError;

    for (const extension of extensionCandidates) {
      try {
        return await nextResolve(`${candidate.href}${extension}`, context);
      } catch {
        // Try the next supported JavaScript extension.
      }
    }

    for (const extension of extensionCandidates) {
      try {
        return await nextResolve(
          new URL(
            `index${extension}`,
            `${candidate.href.replace(/\/$/, "")}/`,
          ).href,
          context,
        );
      } catch {
        // Try the next directory index candidate.
      }
    }

    throw originalError;
  }
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return resolveFileUrl(
      new URL(specifier.slice(2), rootUrl),
      context,
      nextResolve,
    );
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return resolveFileUrl(
      new URL(specifier, context.parentURL || rootUrl),
      context,
      nextResolve,
    );
  }

  if (specifier.startsWith("file:")) {
    return resolveFileUrl(new URL(specifier), context, nextResolve);
  }

  return nextResolve(specifier, context);
}
