export const FINANCE_POPULATION_PAGE_SIZE = 1000;
export const FINANCE_POPULATION_MAX_ROWS = 50000;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function fetchCompleteFinancePopulation({
  buildQuery,
  label,
  pageSize = FINANCE_POPULATION_PAGE_SIZE,
  maxRows = FINANCE_POPULATION_MAX_ROWS,
} = {}) {
  if (typeof buildQuery !== "function") {
    throw new Error("Finance population query builder is required");
  }

  const safePageSize = positiveInteger(pageSize, FINANCE_POPULATION_PAGE_SIZE);
  const safeMaxRows = positiveInteger(maxRows, FINANCE_POPULATION_MAX_ROWS);
  const populationLabel = String(label || "Finance population").trim() || "Finance population";
  const rows = [];
  let pages = 0;
  let from = 0;

  while (from <= safeMaxRows) {
    const requestedRows = Math.min(safePageSize, safeMaxRows + 1 - from);
    const to = from + requestedRows - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    pages += 1;

    if (rows.length > safeMaxRows) {
      throw new Error(
        `${populationLabel} exceeds the ${safeMaxRows}-row completeness boundary; Avantiqo will not present a silently truncated accounting population`,
      );
    }

    if (page.length < requestedRows) {
      return {
        rows,
        pages,
        complete: true,
        page_size: safePageSize,
        max_rows: safeMaxRows,
      };
    }

    from = to + 1;
  }

  throw new Error(
    `${populationLabel} reached the ${safeMaxRows}-row completeness boundary; Avantiqo will not present a silently truncated accounting population`,
  );
}
