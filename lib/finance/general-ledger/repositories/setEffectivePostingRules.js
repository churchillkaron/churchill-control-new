import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const DEFAULT_PRIORITY = 100;

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function normalizeToken(value, field) {
  return required(value, field).toUpperCase();
}

function normalizeDate(value, field = "effectiveDate") {
  const normalized = required(value, field).slice(0, 10);
  const candidate = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return candidate.toISOString().slice(0, 10);
}

function shiftDate(value, days) {
  const candidate = new Date(`${value}T00:00:00.000Z`);
  candidate.setUTCDate(candidate.getUTCDate() + days);
  return candidate.toISOString().slice(0, 10);
}

function normalizePriority(value) {
  const priority = Number(value ?? DEFAULT_PRIORITY);
  if (!Number.isInteger(priority) || priority <= 0) {
    throw new Error("posting rule priority must be a positive integer");
  }
  return priority;
}

function normalizeRule(rule, index) {
  const name = required(rule?.name, `rules[${index}].name`);
  const eventType = normalizeToken(
    rule?.eventType || rule?.event_type,
    `rules[${index}].eventType`
  );
  const sourceModule = normalizeToken(
    rule?.sourceModule || rule?.source_module,
    `rules[${index}].sourceModule`
  );
  const debitAccountId = required(
    rule?.debitAccountId || rule?.debit_account_id,
    `rules[${index}].debitAccountId`
  );
  const creditAccountId = required(
    rule?.creditAccountId || rule?.credit_account_id,
    `rules[${index}].creditAccountId`
  );

  if (debitAccountId === creditAccountId) {
    throw new Error(`${name} must use different debit and credit accounts`);
  }

  return {
    name,
    eventType,
    sourceModule,
    debitAccountId,
    creditAccountId,
    priority: normalizePriority(rule?.priority),
  };
}

async function validateScope({ organizationId, entityId, rules }) {
  const { data: entity, error: entityError } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();

  if (entityError) throw entityError;
  if (!entity) throw new Error("Legal entity not found in organisation");

  const accountIds = [
    ...new Set(
      rules.flatMap((rule) => [rule.debitAccountId, rule.creditAccountId])
    ),
  ];

  const { data: accounts, error: accountsError } = await supabaseAdmin
    .from("chart_of_accounts")
    .select("id, is_active")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .in("id", accountIds);

  if (accountsError) throw accountsError;

  const accountMap = new Map((accounts || []).map((account) => [account.id, account]));
  for (const accountId of accountIds) {
    const account = accountMap.get(accountId);
    if (!account) {
      throw new Error("Posting rule accounts must belong to the selected Legal Entity");
    }
    if (account.is_active === false) {
      throw new Error("Posting rule accounts must be active");
    }
  }
}

async function listActiveRules({ organizationId, entityId, eventType, sourceModule }) {
  const { data, error } = await supabaseAdmin
    .from("finance_posting_rules")
    .select(
      "id, name, event_type, source_module, debit_account_id, credit_account_id, effective_from, effective_to, priority, status"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("event_type", eventType)
    .eq("source_module", sourceModule)
    .eq("status", "ACTIVE")
    .order("effective_from", { ascending: true })
    .order("priority", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

function samePostingAccounts(row, rule) {
  return (
    String(row?.debit_account_id || "") === rule.debitAccountId &&
    String(row?.credit_account_id || "") === rule.creditAccountId
  );
}

function buildPlan({ rows, rule, effectiveDate }) {
  const exactRows = rows.filter(
    (row) =>
      row.effective_from === effectiveDate &&
      Number(row.priority) === rule.priority
  );

  if (exactRows.length > 1) {
    throw new Error(
      `Multiple ${rule.name} posting rules start on ${effectiveDate} at priority ${rule.priority}`
    );
  }

  const exact = exactRows[0] || null;
  if (exact && !samePostingAccounts(exact, rule)) {
    throw new Error(
      `${rule.name} already has a different rule starting on ${effectiveDate}; choose a later effective date to preserve accounting history`
    );
  }

  const predecessors = rows.filter(
    (row) =>
      Number(row.priority) === rule.priority &&
      row.effective_from < effectiveDate &&
      (!row.effective_to || row.effective_to >= effectiveDate)
  );

  const nextFuture =
    rows
      .filter(
        (row) =>
          Number(row.priority) === rule.priority &&
          row.effective_from > effectiveDate
      )
      .sort((left, right) =>
        left.effective_from.localeCompare(right.effective_from)
      )[0] || null;

  const effectiveTo = nextFuture
    ? shiftDate(nextFuture.effective_from, -1)
    : null;

  return {
    rule,
    exact,
    predecessors,
    effectiveTo,
    adjustExactEndDate: Boolean(
      exact && (exact.effective_to || null) !== effectiveTo
    ),
  };
}

async function insertPlan({ organizationId, entityId, effectiveDate, createdBy, plan }) {
  if (plan.exact) return plan.exact;

  const { data, error } = await supabaseAdmin
    .from("finance_posting_rules")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      name: plan.rule.name,
      event_type: plan.rule.eventType,
      source_module: plan.rule.sourceModule,
      debit_account_id: plan.rule.debitAccountId,
      credit_account_id: plan.rule.creditAccountId,
      effective_from: effectiveDate,
      effective_to: plan.effectiveTo,
      priority: plan.rule.priority,
      status: "ACTIVE",
      created_by: createdBy || null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function closePredecessors({ organizationId, entityId, effectiveDate, plan }) {
  const now = new Date().toISOString();

  if (plan.adjustExactEndDate && plan.exact) {
    const { error } = await supabaseAdmin
      .from("finance_posting_rules")
      .update({ effective_to: plan.effectiveTo, updated_at: now })
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("id", plan.exact.id)
      .eq("status", "ACTIVE");

    if (error) throw error;
  }

  const predecessorEndDate = shiftDate(effectiveDate, -1);

  for (const predecessor of plan.predecessors) {
    const { error } = await supabaseAdmin
      .from("finance_posting_rules")
      .update({ effective_to: predecessorEndDate, updated_at: now })
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .eq("id", predecessor.id)
      .eq("status", "ACTIVE");

    if (error) throw error;
  }
}

export async function setEffectivePostingRules({
  organizationId,
  entityId,
  effectiveDate,
  rules,
  createdBy = null,
}) {
  const resolvedOrganizationId = required(organizationId, "organizationId");
  const resolvedEntityId = required(entityId, "entityId");
  const resolvedEffectiveDate = normalizeDate(effectiveDate);
  const normalizedRules = Array.isArray(rules)
    ? rules.map(normalizeRule)
    : [];

  if (!normalizedRules.length) {
    throw new Error("At least one posting rule is required");
  }

  const identities = new Set();
  for (const rule of normalizedRules) {
    const identity = `${rule.eventType}:${rule.sourceModule}:${rule.priority}`;
    if (identities.has(identity)) {
      throw new Error(`Duplicate posting rule identity ${identity}`);
    }
    identities.add(identity);
  }

  await validateScope({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    rules: normalizedRules,
  });

  const plans = [];
  for (const rule of normalizedRules) {
    const rows = await listActiveRules({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      eventType: rule.eventType,
      sourceModule: rule.sourceModule,
    });
    plans.push(
      buildPlan({ rows, rule, effectiveDate: resolvedEffectiveDate })
    );
  }

  // Insert new effective versions before retiring predecessors. If a later write
  // fails, a retry recognizes matching exact rows and finishes the lifecycle
  // without inventing accounts or creating a temporary date gap.
  for (const plan of plans) {
    await insertPlan({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      effectiveDate: resolvedEffectiveDate,
      createdBy,
      plan,
    });
  }

  for (const plan of plans) {
    await closePredecessors({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      effectiveDate: resolvedEffectiveDate,
      plan,
    });
  }

  return {
    organization_id: resolvedOrganizationId,
    entity_id: resolvedEntityId,
    effective_date: resolvedEffectiveDate,
    rules: plans.map(({ rule }) => ({
      event_type: rule.eventType,
      source_module: rule.sourceModule,
      debit_account_id: rule.debitAccountId,
      credit_account_id: rule.creditAccountId,
      priority: rule.priority,
    })),
  };
}

export default setEffectivePostingRules;
