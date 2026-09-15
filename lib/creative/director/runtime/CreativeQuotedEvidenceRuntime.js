function text(value) {
  return String(value ?? "").trim();
}

export function quotedEvidenceFragments(evidence = "") {
  const pattern = /"([^"]{24,240})"|`([^`]{24,240})`|(?<![A-Za-z0-9])'([^']{24,240})'(?![A-Za-z0-9])/g;
  return [...String(evidence).matchAll(pattern)]
    .map((match) => text(match[1] || match[2] || match[3]))
    .filter(Boolean);
}

export const CreativeQuotedEvidenceRuntime = Object.freeze({
  fragments: quotedEvidenceFragments,
});
