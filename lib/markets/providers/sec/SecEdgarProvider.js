const SEC_DATA_BASE_URL = "https://data.sec.gov";
const SEC_ARCHIVES_BASE_URL = "https://www.sec.gov";
const TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";

let tickerMapCache = null;
let tickerMapLoadedAt = 0;
const TICKER_MAP_TTL_MS = 6 * 60 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function paddedCik(value) {
  const digits = text(value).replace(/\D/g, "");
  if (!digits) throw new Error("SEC_CIK_REQUIRED");
  return digits.padStart(10, "0");
}

function declaredUserAgent() {
  const value = text(process.env.SEC_EDGAR_USER_AGENT);
  if (!value) {
    throw new Error("SEC_EDGAR_USER_AGENT_REQUIRED");
  }
  return value;
}

async function fetchSecJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": declaredUserAgent(),
      "Accept-Encoding": "gzip, deflate",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`SEC_EDGAR_ERROR:${response.status}:${url}`);
  }
  return response.json();
}

function columnValue(recent, key, index) {
  const values = Array.isArray(recent?.[key]) ? recent[key] : [];
  return values[index] ?? null;
}

async function tickerMap() {
  if (tickerMapCache && (Date.now() - tickerMapLoadedAt) < TICKER_MAP_TTL_MS) {
    return tickerMapCache;
  }
  const payload = await fetchSecJson(TICKER_MAP_URL);
  const rows = Object.values(payload || {});
  tickerMapCache = rows;
  tickerMapLoadedAt = Date.now();
  return rows;
}

export async function lookupCompanyByTicker({ symbol }) {
  const ticker = text(symbol).toUpperCase();
  if (!ticker) throw new Error("symbol required");

  const rows = await tickerMap();
  const match = rows.find((row) => text(row?.ticker).toUpperCase() === ticker) || null;
  if (!match) return null;

  return {
    symbol: ticker,
    cik: paddedCik(match.cik_str),
    name: match.title || null,
    provenance: {
      provider: "sec_edgar",
      source_url: TICKER_MAP_URL,
      fetched_at: new Date().toISOString(),
    },
  };
}

export async function getCompanySubmissions({ cik, forms = null, limit = 40 }) {
  const normalizedCik = paddedCik(cik);
  const sourceUrl = `${SEC_DATA_BASE_URL}/submissions/CIK${normalizedCik}.json`;
  const payload = await fetchSecJson(sourceUrl);
  const recent = payload?.filings?.recent || {};
  const accessionNumbers = Array.isArray(recent.accessionNumber) ? recent.accessionNumber : [];
  const allowedForms = Array.isArray(forms) && forms.length
    ? new Set(forms.map((value) => text(value).toUpperCase()))
    : null;
  const rows = [];

  for (let index = 0; index < accessionNumbers.length && rows.length < limit; index += 1) {
    const form = text(columnValue(recent, "form", index)).toUpperCase();
    if (allowedForms && !allowedForms.has(form)) continue;
    const accessionNumber = text(accessionNumbers[index]);
    if (!accessionNumber) continue;

    const primaryDocument = text(columnValue(recent, "primaryDocument", index));
    const accessionPath = accessionNumber.replace(/-/g, "");
    const filingUrl = primaryDocument
      ? `${SEC_ARCHIVES_BASE_URL}/Archives/edgar/data/${Number(normalizedCik)}/${accessionPath}/${primaryDocument}`
      : null;

    rows.push({
      cik: normalizedCik,
      company_name: payload?.name || null,
      tickers: Array.isArray(payload?.tickers) ? payload.tickers : [],
      exchanges: Array.isArray(payload?.exchanges) ? payload.exchanges : [],
      accession_number: accessionNumber,
      form_type: form,
      filed_at: columnValue(recent, "filingDate", index),
      accepted_at: columnValue(recent, "acceptanceDateTime", index),
      report_date: columnValue(recent, "reportDate", index),
      primary_document: primaryDocument || null,
      filing_url: filingUrl,
      description: columnValue(recent, "primaryDocDescription", index),
      raw_payload: {
        accessionNumber,
        form,
        filingDate: columnValue(recent, "filingDate", index),
        acceptanceDateTime: columnValue(recent, "acceptanceDateTime", index),
        reportDate: columnValue(recent, "reportDate", index),
        primaryDocument,
        primaryDocDescription: columnValue(recent, "primaryDocDescription", index),
        items: columnValue(recent, "items", index),
      },
      provenance: {
        provider: "sec_edgar",
        source_url: sourceUrl,
        fetched_at: new Date().toISOString(),
      },
    });
  }

  return {
    company: {
      cik: normalizedCik,
      name: payload?.name || null,
      tickers: Array.isArray(payload?.tickers) ? payload.tickers : [],
      exchanges: Array.isArray(payload?.exchanges) ? payload.exchanges : [],
      sic: payload?.sic || null,
      sic_description: payload?.sicDescription || null,
      fiscal_year_end: payload?.fiscalYearEnd || null,
    },
    filings: rows,
    provenance: {
      provider: "sec_edgar",
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  };
}

export async function getCompanyFacts({ cik }) {
  const normalizedCik = paddedCik(cik);
  const sourceUrl = `${SEC_DATA_BASE_URL}/api/xbrl/companyfacts/CIK${normalizedCik}.json`;
  const payload = await fetchSecJson(sourceUrl);

  return {
    cik: normalizedCik,
    entity_name: payload?.entityName || null,
    facts: payload?.facts || {},
    provenance: {
      provider: "sec_edgar",
      source_url: sourceUrl,
      fetched_at: new Date().toISOString(),
    },
  };
}

export const SecEdgarProvider = {
  lookupTicker: lookupCompanyByTicker,
  submissions: getCompanySubmissions,
  companyFacts: getCompanyFacts,
};
