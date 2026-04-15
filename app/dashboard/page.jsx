"use client";
// ONLY CHANGE: SAFE PARSE + GUARANTEED STRUCTURE

function parseDishes(value) {
  if (!value) return { meta: {}, rows: [], insights: [] };

  if (typeof value === "object") {
    return {
      meta: value.meta || {},
      rows: Array.isArray(value.rows) ? value.rows : [],
      insights: Array.isArray(value.insights) ? value.insights : [],
    };
  }

  try {
    const parsed = JSON.parse(value);

    return {
      meta: parsed?.meta || {},
      rows: Array.isArray(parsed?.rows) ? parsed.rows : [],
      insights: Array.isArray(parsed?.insights) ? parsed.insights : [],
    };
  } catch {
    return { meta: {}, rows: [], insights: [] };
  }
}