#!/usr/bin/env node

const original = process.argv.slice(2).join(" ").trim();

function normalizeDuration(value) {
  let source = String(value || "").trim();
  if (!source) return source;

  source = source.replace(
    /\b(\d{1,3})\s*:\s*([0-5]\d)\b/g,
    (_, minutes, seconds) => `${Number(minutes) * 60 + Number(seconds)} seconds`,
  );

  source = source.replace(
    /\b(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min)\b/gi,
    (_, minutes) => `${Number((Number(minutes) * 60).toFixed(3))} seconds`,
  );

  return source;
}

process.stdout.write(normalizeDuration(original));
