import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";
import {
  CreativeAutonomousRepairDirectorRuntime,
} from "./CreativeAutonomousRepairDirectorRuntime";

const FLAG = Symbol.for(
  "avantiqo.creative.owned-cinema-repair-provider-policy.v1",
);
const CONTRACT = "CREATIVE_OWNED_CINEMA_REPAIR_PROVIDER_POLICY_V1";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function unique(values = []) {
  return [...new Set(list(values).map(text).filter(Boolean))];
}

function cinemaTask(task = {}) {
  return text(task.capability || task.service_code || task.service_id)
    .toLowerCase()
    .startsWith("ai.video.");
}

function ownedProvider(value) {
  return text(value).toLowerCase().startsWith("avantiqo-");
}

function pairItems(result = {}) {
  const candidates = [
    ...list(result.pair_recovery?.created),
    ...list(result.created),
  ];
  const seen = new Set();
  return candidates.filter((item) => {
    const replacementId = text(item.replacement_source_task_id);
    if (!replacementId || seen.has(replacementId)) return false;
    seen.add(replacementId);
    return true;
  });
}

async function preserveOwnedCinemaEligibility(pair = {}) {
  const sourceId = text(pair.source_task_id);
  const replacementId = text(pair.replacement_source_task_id);
  if (!sourceId || !replacementId) return null;

  const [source, replacement] = await Promise.all([
    ProductionTaskRuntime.get(sourceId),
    ProductionTaskRuntime.get(replacementId),
  ]);
  if (!source || !replacement || !cinemaTask(source)) return null;

  const provider = text(
    source.provider_id ||
    source.output?.provider ||
    source.output?.provider_submission?.provider,
  );
  if (!ownedProvider(provider)) return null;

  const policy = object(replacement.input?.provider_policy);
  const blocked = unique(
    policy.blocked_providers || policy.blockedProviders,
  ).filter((candidate) => text(candidate) !== provider);
  const repairSpecification = object(replacement.input?.repair_specification);
  const specificationBlocked = unique(
    repairSpecification.blocked_provider_ids,
  ).filter((candidate) => text(candidate) !== provider);

  return ProductionTaskRuntime.update(replacement.id, {
    provider_id: null,
    input: {
      ...object(replacement.input),
      provider_policy: {
        ...policy,
        blocked_providers: blocked,
      },
      repair_specification: {
        ...repairSpecification,
        blocked_provider_ids: specificationBlocked,
        owned_retry_preferred: true,
        owned_retry_provider_id: provider,
        external_challenger_is_fallback_only: true,
      },
    },
    metadata: {
      ...object(replacement.metadata),
      owned_cinema_repair_provider_policy_contract: CONTRACT,
      owned_retry_preferred: true,
      owned_retry_provider_id: provider,
      external_challenger_is_fallback_only: true,
      blocked_provider_ids: blocked,
      challenger_provider_required: blocked.length > 0,
      provider_selection_pending: true,
      provider_selection_owned_by_service_domain: true,
    },
  });
}

function install() {
  if (CreativeAutonomousRepairDirectorRuntime[FLAG]) return;
  const ensureWithoutOwnedCinemaPolicy =
    CreativeAutonomousRepairDirectorRuntime.ensure.bind(
      CreativeAutonomousRepairDirectorRuntime,
    );
  Object.defineProperty(CreativeAutonomousRepairDirectorRuntime, FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
  });

  CreativeAutonomousRepairDirectorRuntime.ensure = async function ensureOwnedCinemaRepairPolicy(
    input = {},
  ) {
    const result = await ensureWithoutOwnedCinemaPolicy(input);
    const preserved = [];
    for (const pair of pairItems(result)) {
      const updated = await preserveOwnedCinemaEligibility(pair);
      if (updated) preserved.push(updated.id);
    }
    return {
      ...result,
      owned_cinema_repair_provider_policy_contract: CONTRACT,
      owned_cinema_repair_eligibility_preserved: preserved,
    };
  };
}

install();

export const CreativeOwnedCinemaRepairProviderPolicyBootstrap = Object.freeze({
  installed: true,
  contract: CONTRACT,
  preserveOwnedCinemaEligibility,
});
