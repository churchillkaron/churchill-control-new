import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://audit.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'audit-service-role-key';
register('../scripts/next-alias-loader.mjs', import.meta.url);

const { prioritizeOperatorBusinessReads } = await import('../lib/operator/runtime/OperatorBusinessReadResolver.js');
const {
  fastVoiceFallbackReason,
  resolveOperatorMultiReadRequirement,
} = await import('../lib/operator/runtime/OperatorReasoningRuntime.js');

const readChain = {
  key: 'platform.operator_read_chain.execute',
  domain: 'platform',
  capability: 'operator_read_chain',
  action: 'execute',
  mode: 'read',
  risk: 'low',
  description: 'Run bounded Operator-enabled reads for a multi-part business question.',
};
const assignments = {
  key: 'operations.assignments.list',
  domain: 'operations',
  capability: 'assignments',
  action: 'list',
  mode: 'read',
  risk: 'low',
  description: 'List current operational assignments and accountable staffing ownership.',
};
const bookings = {
  key: 'solutions.hotel_bookings.read',
  domain: 'solutions',
  capability: 'hotel_bookings',
  action: 'read',
  mode: 'read',
  risk: 'low',
  description: 'Read current hotel bookings, arrivals and readiness.',
};
const alerts = {
  key: 'operations.alerts.list',
  domain: 'operations',
  capability: 'alerts',
  action: 'list',
  mode: 'read',
  risk: 'low',
  description: 'List current operational alerts and unresolved issues.',
};

function request(message) {
  return {
    user_input: { message },
    business_context: { entity_id: 'entity-1' },
    navigation_targets: [],
    executable_capabilities: [assignments, bookings, alerts, readChain],
  };
}

test('read prioritization reserves a candidate slot for the governed read chain', () => {
  const result = prioritizeOperatorBusinessReads({
    message: 'Do staffing assignments match tonight hotel bookings?',
    capabilities: [assignments, bookings, alerts, readChain],
    fallback: [assignments, bookings, alerts],
    limit: 3,
  });
  const keys = result.capabilities.map((item) => item.key);
  assert.equal(keys.includes(readChain.key), true);
  assert.equal(keys.length, 3);
});

test('multi-part staffing versus booking question resolves at least two material reads', () => {
  const result = resolveOperatorMultiReadRequirement({
    message: 'Do we have enough people assigned for tonight hotel arrivals?',
    capabilities: [assignments, bookings, alerts, readChain],
  });
  assert.ok(result);
  assert.equal(result.read_chain_available, true);
  assert.equal(result.capability_keys.includes(assignments.key), true);
  assert.equal(result.capability_keys.includes(bookings.key), true);
});

test('fast reasoning rejects a one-read answer for a multi-read comparison', () => {
  const parsed = {
    intent: 'execute',
    confidence: 0.95,
    clarification: { required: false, question: null, options: [] },
    execution: { capability_key: assignments.key, payload: {}, reason: null },
  };
  assert.equal(
    fastVoiceFallbackReason(parsed, request('Do we have enough people assigned for tonight hotel arrivals?')),
    'multi_read_chain_required',
  );
});

test('fast reasoning accepts the governed read chain when all required reads are present', () => {
  const parsed = {
    intent: 'execute',
    confidence: 0.95,
    clarification: { required: false, question: null, options: [] },
    execution: {
      capability_key: readChain.key,
      payload: {
        steps: [
          { id: 'staffing', capability_key: assignments.key, payload: {} },
          { id: 'bookings', capability_key: bookings.key, payload: {} },
        ],
      },
      reason: null,
    },
  };
  assert.equal(
    fastVoiceFallbackReason(parsed, request('Do we have enough people assigned for tonight hotel arrivals?')),
    null,
  );
});

test('single current read does not spuriously require a read chain', () => {
  assert.equal(
    resolveOperatorMultiReadRequirement({
      message: 'Show tonight hotel arrivals.',
      capabilities: [assignments, bookings, alerts, readChain],
    }),
    null,
  );
});
