import {
  AvantiqoVideoProvider,
} from "./AvantiqoVideoProvider";

const FLAG = Symbol.for(
  "avantiqo.video.cinematic-state-memory-provider-bootstrap.v1",
);
const LEDGER_CONTRACT = "CREATIVE_CINEMATIC_STATE_LEDGER_V1";
const TRANSPORT_CONTRACT = "AVANTIQO_CINEMATIC_STATE_MEMORY_TRANSPORT_V1";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function compact(value, depth = 0) {
  if (depth > 3) return null;
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => compact(item, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.slice(0, 240);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 14)
      .map(([key, child]) => [key, compact(child, depth + 1)]),
  );
}

function ledger(input = {}) {
  const candidate = object(
    input.cinematic_state_memory ||
    input.requirements?.cinematic_state_memory,
  );
  return text(candidate.contract) === LEDGER_CONTRACT ? candidate : null;
}

function transportMemory(input = {}) {
  const stateLedger = ledger(input);
  if (!stateLedger) return null;
  const authoritative = list(stateLedger.authoritative_states);
  const latest = authoritative[0] || null;
  if (!latest) {
    return {
      contract: TRANSPORT_CONTRACT,
      ledger_hash: stateLedger.ledger_hash || null,
      authoritative_state_count: 0,
      reviewed_only: true,
      no_prior_approved_state: true,
    };
  }
  return compact({
    contract: TRANSPORT_CONTRACT,
    ledger_hash: stateLedger.ledger_hash || null,
    authoritative_state_count: authoritative.length,
    current_shot_id: stateLedger.current_shot_id || null,
    source_state: {
      shot_id: latest.shot_id || null,
      scene_id: latest.scene_id || null,
      state_hash: latest.state_hash || null,
      chain_hash: latest.chain_hash || null,
      identity: latest.identity || {},
      product: latest.product || {},
      environment: latest.environment || {},
      spatial: latest.spatial || {},
      endpoint_lineage: latest.endpoint_lineage || {},
    },
    lineage: list(stateLedger.approved_state_hash_history)
      .slice(-6)
      .map((item) => ({
        shot_id: item.shot_id || null,
        state_hash: item.state_hash || null,
        chain_hash: item.chain_hash || null,
      })),
    policy: {
      reviewed_only: true,
      preserve_authoritative_state: true,
      do_not_rewrite_approved_neighbors: true,
      failed_or_superseded_outputs_excluded: true,
    },
  });
}

function bindInput(input = {}) {
  const memory = transportMemory(input);
  if (!memory) return { input, memory: null };
  const shotSpecification = object(
    input.shot_specification ||
    input.shotSpecification ||
    input.generation?.shot_specification,
  );
  const continuity = object(
    input.continuity ||
    shotSpecification.continuity ||
    input.requirements?.continuity,
  );
  return {
    memory,
    input: {
      ...input,
      shot_specification: {
        ...shotSpecification,
        cinematic_state_memory: memory,
      },
      continuity: {
        ...continuity,
        cinematic_state_memory_contract: TRANSPORT_CONTRACT,
        cinematic_state_memory_ledger_hash: memory.ledger_hash || null,
        cinematic_state_source_state_hash:
          memory.source_state?.state_hash || null,
        cinematic_state_preservation_required: true,
      },
    },
  };
}

function bindOutput(result = {}, memory = null) {
  if (!memory) return result;
  return {
    ...result,
    output: {
      ...object(result.output),
      cinematic_state_memory_bound: true,
      cinematic_state_memory_contract: TRANSPORT_CONTRACT,
      cinematic_state_memory_ledger_hash: memory.ledger_hash || null,
      cinematic_state_memory_source_state_hash:
        memory.source_state?.state_hash || null,
      cinematic_state_memory_source_chain_hash:
        memory.source_state?.chain_hash || null,
      cinematic_state_memory_authoritative_state_count:
        Number(memory.authoritative_state_count || 0),
      cinematic_state_memory_reviewed_only: true,
    },
  };
}

function install() {
  if (AvantiqoVideoProvider[FLAG]) return;
  const executeWithoutStateMemory = AvantiqoVideoProvider.execute.bind(
    AvantiqoVideoProvider,
  );
  Object.defineProperty(AvantiqoVideoProvider, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  AvantiqoVideoProvider.execute = async function executeWithCinematicStateMemory(
    input = {},
  ) {
    const bound = bindInput(input);
    const result = await executeWithoutStateMemory(bound.input);
    return bindOutput(result, bound.memory);
  };
}

install();

export const AvantiqoVideoCinematicStateMemoryBootstrap = Object.freeze({
  installed: true,
  ledgerContract: LEDGER_CONTRACT,
  transportContract: TRANSPORT_CONTRACT,
  transportMemory,
  bindInput,
});
