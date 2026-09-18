function clean(value) {
  return String(value || "").trim();
}

function ref(type, row, extra = {}) {
  const id = clean(row?.id);
  if (!id) return null;
  return {
    type,
    id,
    symbol: clean(row?.symbol).toUpperCase() || null,
    observed_at:
      row?.observed_at ||
      row?.bar_time ||
      row?.filed_at ||
      row?.period_end ||
      row?.captured_at ||
      row?.generated_at ||
      null,
    ...extra,
  };
}

function dedupe(refs = []) {
  const seen = new Set();
  return refs.filter((row) => {
    if (!row?.type || !row?.id) return false;
    const key = `${row.type}:${row.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildThesisEvidenceRefs({
  agentType,
  symbol,
  bars = [],
  evidence = [],
  filings = [],
  fundamentals = [],
  snapshot = null,
}) {
  const ticker = clean(symbol).toUpperCase();
  const type = clean(agentType).toUpperCase();
  const refs = [];

  if (["TECHNICAL", "QUANT"].includes(type)) {
    for (const row of bars.slice(-250)) {
      if (!row?.symbol || clean(row.symbol).toUpperCase() === ticker) {
        const item = ref("MARKET_BAR", row, {
          timeframe: row?.timeframe || null,
          provider: row?.provider || null,
        });
        if (item) refs.push(item);
      }
    }
    const snapshotRef = ref("MARKET_SNAPSHOT", snapshot, {
      provider: snapshot?.provider || null,
    });
    if (snapshotRef) refs.push(snapshotRef);
  }

  if (type === "NEWS") {
    for (const row of evidence) {
      if (!row?.symbol || clean(row.symbol).toUpperCase() === ticker) {
        const item = ref("EVIDENCE_EVENT", row, {
          evidence_type: row?.evidence_type || null,
          source_name: row?.source_name || null,
        });
        if (item) refs.push(item);
      }
    }
  }

  if (type === "FUNDAMENTAL") {
    for (const row of fundamentals) {
      if (!row?.symbol || clean(row.symbol).toUpperCase() === ticker) {
        const item = ref("FUNDAMENTAL_SNAPSHOT", row, {
          provider: row?.provider || null,
        });
        if (item) refs.push(item);
      }
    }
    for (const row of filings) {
      if (!row?.symbol || clean(row.symbol).toUpperCase() === ticker) {
        const item = ref("FILING", row, {
          provider: row?.provider || null,
          form_type: row?.form_type || null,
          accession_number: row?.accession_number || null,
        });
        if (item) refs.push(item);
      }
    }
  }

  return dedupe(refs);
}

export function evidenceEventIdsFromRefs(refs = []) {
  return [...new Set(
    refs
      .filter((row) => row?.type === "EVIDENCE_EVENT" && clean(row?.id))
      .map((row) => clean(row.id)),
  )];
}

export function mergeEvidenceRefs(...groups) {
  return dedupe(groups.flat().filter(Boolean));
}

export function selectSupportingTheses({
  theses = [],
  specialistAgents = [],
}) {
  const allowed = new Set(
    specialistAgents
      .map((value) => clean(value).toUpperCase())
      .filter(Boolean),
  );
  if (!allowed.size) return [];
  return theses.filter((row) => allowed.has(clean(row?.agent_type).toUpperCase()));
}

export function buildRiskControlEvidenceRefs({
  position = null,
  snapshot = null,
}) {
  return dedupe([
    ref("POSITION", position, {
      opened_at: position?.opened_at || null,
    }),
    ref("MARKET_SNAPSHOT", snapshot, {
      provider: snapshot?.provider || null,
    }),
  ].filter(Boolean));
}

export function buildManualDecisionEvidenceRefs({
  evidenceRows = [],
  theses = [],
}) {
  const directEvidence = evidenceRows
    .map((row) => ref("EVIDENCE_EVENT", row, {
      evidence_type: row?.evidence_type || null,
      source_name: row?.source_name || null,
    }))
    .filter(Boolean);
  const thesisRefs = theses
    .map((row) => ref("THESIS", row, {
      agent_type: row?.agent_type || null,
    }))
    .filter(Boolean);
  const thesisEvidence = theses.flatMap((row) => (
    Array.isArray(row?.evidence_refs) ? row.evidence_refs : []
  ));
  return mergeEvidenceRefs(directEvidence, thesisRefs, thesisEvidence);
}
