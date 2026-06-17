export function architectureGuard(importPath) {
  const forbidden = [
    "lib/shared/finance",
    "lib/shared/pos",
    "lib/shared/procurement",
    "app/(system)/api",
  ];

  for (const rule of forbidden) {
    if (importPath.includes(rule)) {
      throw new Error("ARCHITECTURE VIOLATION: " + importPath);
    }
  }

  return true;
}
