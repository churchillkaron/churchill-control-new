import assert from "node:assert/strict";
import test from "node:test";

import {
  buildThesisEvidenceRefs,
  evidenceEventIdsFromRefs,
  mergeEvidenceRefs,
  selectSupportingTheses,
} from "../lib/markets/runtime/MarketDecisionEvidenceModels.js";

const bars = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    symbol: "AAA",
    timeframe: "1Day",
    provider: "alpaca",
    bar_time: "2026-09-17T20:00:00Z",
  },
];
const snapshot = {
  id: "00000000-0000-0000-0000-000000000002",
  symbol: "AAA",
  provider: "alpaca",
  captured_at: "2026-09-18T12:00:00Z",
};
const evidence = [
  {
    id: "00000000-0000-0000-0000-000000000003",
    symbol: "AAA",
    evidence_type: "NEWS",
    source_name: "benzinga",
    observed_at: "2026-09-18T11:00:00Z",
  },
];
const fundamentals = [
  {
    id: "00000000-0000-0000-0000-000000000004",
    symbol: "AAA",
    provider: "sec_edgar",
    period_end: "2026-06-30",
  },
];
const filings = [
  {
    id: "00000000-0000-0000-0000-000000000005",
    symbol: "AAA",
    provider: "sec_edgar",
    form_type: "10-Q",
    accession_number: "000-test",
    filed_at: "2026-08-01",
  },
];

test("technical evidence references bars and market snapshot", () => {
  const refs = buildThesisEvidenceRefs({
    agentType: "TECHNICAL",
    symbol: "AAA",
    bars,
    snapshot,
  });

  assert.deepEqual(refs.map((row) => row.type), [
    "MARKET_BAR",
    "MARKET_SNAPSHOT",
  ]);
  assert.equal(refs[0].timeframe, "1Day");
});

test("news evidence keeps durable evidence-event identity", () => {
  const refs = buildThesisEvidenceRefs({
    agentType: "NEWS",
    symbol: "AAA",
    evidence,
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0].type, "EVIDENCE_EVENT");
  assert.deepEqual(evidenceEventIdsFromRefs(refs), [evidence[0].id]);
});

test("fundamental evidence references snapshot and filing separately", () => {
  const refs = buildThesisEvidenceRefs({
    agentType: "FUNDAMENTAL",
    symbol: "AAA",
    fundamentals,
    filings,
  });

  assert.deepEqual(refs.map((row) => row.type), [
    "FUNDAMENTAL_SNAPSHOT",
    "FILING",
  ]);
  assert.equal(refs[1].form_type, "10-Q");
});

test("decision evidence union is typed and deduplicated", () => {
  const technical = buildThesisEvidenceRefs({
    agentType: "TECHNICAL",
    symbol: "AAA",
    bars,
    snapshot,
  });
  const quant = buildThesisEvidenceRefs({
    agentType: "QUANT",
    symbol: "AAA",
    bars,
    snapshot,
  });
  const news = buildThesisEvidenceRefs({
    agentType: "NEWS",
    symbol: "AAA",
    evidence,
  });

  const merged = mergeEvidenceRefs(technical, quant, news);
  assert.equal(merged.length, 3);
  assert.deepEqual(evidenceEventIdsFromRefs(merged), [evidence[0].id]);
});

test("evidence refs never pull rows from another symbol", () => {
  const refs = buildThesisEvidenceRefs({
    agentType: "NEWS",
    symbol: "AAA",
    evidence: [
      ...evidence,
      {
        id: "00000000-0000-0000-0000-000000000006",
        symbol: "BBB",
        evidence_type: "NEWS",
      },
    ],
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0].symbol, "AAA");
});

test("decision support excludes ineligible specialist theses", () => {
  const supporting = selectSupportingTheses({
    theses: [
      {
        id: "t1",
        agent_type: "TECHNICAL",
        stance: "BULLISH",
        confidence: 0.8,
      },
      {
        id: "t2",
        agent_type: "NEWS",
        stance: "BULLISH",
        confidence: 0.7,
      },
      {
        id: "t3",
        agent_type: "FUNDAMENTAL",
        stance: "INSUFFICIENT_EVIDENCE",
        confidence: 0,
      },
    ],
    specialistAgents: ["TECHNICAL", "NEWS"],
  });

  assert.deepEqual(supporting.map((row) => row.id), ["t1", "t2"]);
});
