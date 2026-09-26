import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseBusinessPartnerBrowserBenchmarkEnvelope, runBusinessPartnerBrowserBenchmarkTurn } from '../lib/operator/runtime/BusinessPartnerBrowserBenchmarkRuntime.mjs';

const suite=JSON.parse(fs.readFileSync('benchmarks/business-partner/suite.v1.json','utf8'));
const protocol=JSON.parse(fs.readFileSync('benchmarks/business-partner/protocol.v1.json','utf8'));
const evidence=JSON.parse(fs.readFileSync('benchmarks/business-partner/evidence-packet.v1.json','utf8'));
function promptFor(tc){return [protocol.system_instruction,'','Synthetic benchmark context and evidence packet:',JSON.stringify(evidence),'','Benchmark case:',tc.prompt,'','Return one JSON object with exactly these fields:',protocol.response_format.fields.join(', ')].join('\n');}

test('normal Business Partner messages never enter browser benchmark lane',()=>{
  assert.equal(parseBusinessPartnerBrowserBenchmarkEnvelope('Show me the current customer invoices.'),null);
});

test('synthetic browser benchmark lane is non-persisting, non-mutating, and completes the full suite',async()=>{
  for(const tc of suite.cases){
    const result=await runBusinessPartnerBrowserBenchmarkTurn({organizationId:'benchmark-org',partyId:'benchmark-party',entityId:'benchmark-entity',message:promptFor(tc)});
    assert.ok(result,tc.id);
    assert.equal(result.synthetic_only,true,tc.id);
    assert.equal(result.business_mutation_performed,false,tc.id);
    assert.equal(result.conversation_persisted,false,tc.id);
    assert.ok(result.decision,tc.id);
    assert.equal(typeof result.decision.understanding,'string',tc.id);
  }
});

test('natural confirmation with punctuation stays on deterministic governed continuation',async()=>{
  const tc=suite.cases.find((item)=>item.id==='continuity-02');
  const result=await runBusinessPartnerBrowserBenchmarkTurn({organizationId:'benchmark-org',partyId:'benchmark-party',entityId:'benchmark-entity',message:promptFor(tc)});
  assert.equal(result.decision.goal_relation,'continue');
  assert.equal(result.decision.action_type,'write');
  assert.equal(result.decision.confirmation_required,false);
  assert.equal(result.decision.would_execute_now,true);
});
