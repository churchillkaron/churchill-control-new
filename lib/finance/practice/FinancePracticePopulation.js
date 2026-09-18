import { fetchCompleteFinancePopulation } from "@/lib/finance/data/fetchCompleteFinancePopulation";

export function chunkPracticeIds(values, size = 200) {
  const unique = [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  const out = [];
  for (let index = 0; index < unique.length; index += size) out.push(unique.slice(index, index + size));
  return out;
}

export async function loadCompletePracticeRows({ label, buildQuery } = {}) {
  const result = await fetchCompleteFinancePopulation({ label, buildQuery });
  return result.rows || [];
}

export async function loadCompletePracticeRowsByIds({
  ids,
  label,
  buildQuery,
  chunkSize = 200,
} = {}) {
  const rows = [];
  for (const batch of chunkPracticeIds(ids, chunkSize)) {
    const result = await fetchCompleteFinancePopulation({
      label: label + " batch",
      buildQuery: (from, to) => buildQuery(batch, from, to),
    });
    rows.push(...(result.rows || []));
  }
  return rows;
}
