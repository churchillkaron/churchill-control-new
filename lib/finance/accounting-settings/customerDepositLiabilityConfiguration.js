import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getPostingRule } from "@/lib/finance/general-ledger/repositories/getPostingRule";
import { setEffectivePostingRules } from "@/lib/finance/general-ledger/repositories/setEffectivePostingRules";

const SOURCE_MODULE = "ACCOUNTS_RECEIVABLE";
const BASE_RECEIPT_EVENT = "CUSTOMER_PAYMENT_RECEIVED";
const BASE_INVOICE_EVENT = "CUSTOMER_INVOICE_CREATED";

const DEPOSIT_RULES = Object.freeze([
  {
    eventType: "CUSTOMER_UNAPPLIED_CASH_RECEIVED",
    name: "Customer Deposit Received",
    liabilitySide: "CREDIT",
    technicalSide: "DEBIT",
    technicalAccount: "bank",
  },
  {
    eventType: "CUSTOMER_UNAPPLIED_CASH_APPLIED",
    name: "Customer Deposit Applied",
    liabilitySide: "DEBIT",
    technicalSide: "CREDIT",
    technicalAccount: "receivable",
  },
  {
    eventType: "CUSTOMER_UNAPPLIED_CASH_REFUNDED",
    name: "Customer Deposit Refunded",
    liabilitySide: "DEBIT",
    technicalSide: "CREDIT",
    technicalAccount: "bank",
  },
]);

function required(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} required`);
  return normalized;
}

function normalizeDate(value, field = "effectiveDate") {
  const normalized = required(value, field).slice(0, 10);
  const candidate = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(candidate.getTime())) {
    throw new Error(`${field} must be a valid date`);
  }
  return candidate.toISOString().slice(0, 10);
}

function isRuleMissing(error) {
  return /No posting rule configured for/i.test(String(error?.message || error || ""));
}

async function tryGetPostingRule(input) {
  try {
    return await getPostingRule(input);
  } catch (error) {
    if (isRuleMissing(error)) return null;
    throw error;
  }
}

async function validateEntity({ organizationId, entityId }) {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Legal entity not found in organisation");
}

async function loadEntityAccount({ organizationId, entityId, accountId, label }) {
  const { data, error } = await supabaseAdmin
    .from("chart_of_accounts")
    .select(
      "id, account_code, account_name, account_category, account_type, normal_balance, is_active"
    )
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("id", accountId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`${label} must belong to the selected Legal Entity`);
  if (data.is_active === false) throw new Error(`${label} must be active`);
  return data;
}

async function validateLiabilityAccount({ organizationId, entityId, liabilityAccountId }) {
  const account = await loadEntityAccount({
    organizationId,
    entityId,
    accountId: liabilityAccountId,
    label: "Customer Deposit Liability Account",
  });

  const classification = `${account.account_category || ""} ${account.account_type || ""}`
    .trim()
    .toUpperCase();

  if (!classification.includes("LIABIL")) {
    throw new Error("Customer Deposit Liability Account must be a liability account");
  }

  const normalBalance = String(account.normal_balance || "").trim().toUpperCase();
  if (normalBalance && normalBalance !== "CREDIT") {
    throw new Error("Customer Deposit Liability Account must have a credit normal balance");
  }

  return account;
}

async function resolveTechnicalAccounts({ organizationId, entityId, effectiveDate }) {
  const receiptRule = await tryGetPostingRule({
    organizationId,
    entityId,
    eventType: BASE_RECEIPT_EVENT,
    sourceModule: "accounts_receivable",
    postingDate: effectiveDate,
  });

  if (!receiptRule) {
    throw new Error(
      "Configure customer receipt accounting before customer deposit accounting"
    );
  }

  const bankAccountId = required(
    receiptRule.debit_account_id,
    "Customer receipt bank-side account"
  );
  const receivableAccountId = required(
    receiptRule.credit_account_id,
    "Customer receipt receivable account"
  );

  if (bankAccountId === receivableAccountId) {
    throw new Error("Customer receipt accounting must use different bank and receivable accounts");
  }

  await Promise.all([
    loadEntityAccount({
      organizationId,
      entityId,
      accountId: bankAccountId,
      label: "Customer receipt bank-side account",
    }),
    loadEntityAccount({
      organizationId,
      entityId,
      accountId: receivableAccountId,
      label: "Customer receipt receivable account",
    }),
  ]);

  const invoiceRule = await tryGetPostingRule({
    organizationId,
    entityId,
    eventType: BASE_INVOICE_EVENT,
    sourceModule: "accounts_receivable",
    postingDate: effectiveDate,
  });

  if (
    invoiceRule?.debit_account_id &&
    String(invoiceRule.debit_account_id) !== receivableAccountId
  ) {
    throw new Error(
      "Customer invoice and customer receipt accounting use different receivable accounts"
    );
  }

  return { bankAccountId, receivableAccountId };
}

function liabilityAccountFromRule(definition, rule) {
  if (!rule) return null;
  return definition.liabilitySide === "DEBIT"
    ? rule.debit_account_id || null
    : rule.credit_account_id || null;
}

function technicalAccountFromRule(definition, rule) {
  if (!rule) return null;
  return definition.technicalSide === "DEBIT"
    ? rule.debit_account_id || null
    : rule.credit_account_id || null;
}

function buildPostingRules({ liabilityAccountId, bankAccountId, receivableAccountId }) {
  return DEPOSIT_RULES.map((definition) => {
    const technicalAccountId = definition.technicalAccount === "bank"
      ? bankAccountId
      : receivableAccountId;

    const debitAccountId = definition.liabilitySide === "DEBIT"
      ? liabilityAccountId
      : technicalAccountId;
    const creditAccountId = definition.liabilitySide === "CREDIT"
      ? liabilityAccountId
      : technicalAccountId;

    return {
      name: definition.name,
      eventType: definition.eventType,
      sourceModule: SOURCE_MODULE,
      debitAccountId,
      creditAccountId,
      priority: 100,
    };
  });
}

async function loadEffectiveDepositRules({ organizationId, entityId, effectiveDate }) {
  return Promise.all(
    DEPOSIT_RULES.map(async (definition) => ({
      definition,
      rule: await tryGetPostingRule({
        organizationId,
        entityId,
        eventType: definition.eventType,
        sourceModule: "accounts_receivable",
        postingDate: effectiveDate,
      }),
    }))
  );
}

export async function getCustomerDepositLiabilityConfiguration({
  organizationId,
  entityId,
  effectiveDate = new Date().toISOString().slice(0, 10),
}) {
  const resolvedOrganizationId = required(organizationId, "organizationId");
  const resolvedEntityId = required(entityId, "entityId");
  const resolvedEffectiveDate = normalizeDate(effectiveDate);

  await validateEntity({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
  });

  let technicalAccounts = null;
  let baseAccountingReady = true;
  let baseAccountingError = null;

  try {
    technicalAccounts = await resolveTechnicalAccounts({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      effectiveDate: resolvedEffectiveDate,
    });
  } catch (error) {
    baseAccountingReady = false;
    baseAccountingError = error.message;
  }

  const resolvedRules = await loadEffectiveDepositRules({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    effectiveDate: resolvedEffectiveDate,
  });
  const liabilityAccountIds = resolvedRules
    .map(({ definition, rule }) => liabilityAccountFromRule(definition, rule))
    .filter(Boolean);
  const uniqueLiabilityAccounts = [...new Set(liabilityAccountIds)];
  const allRulesPresent = liabilityAccountIds.length === DEPOSIT_RULES.length;
  const configurationConsistent = allRulesPresent && uniqueLiabilityAccounts.length === 1;
  const liabilityAccountId = configurationConsistent ? uniqueLiabilityAccounts[0] : null;

  let liabilityAccount = null;
  if (liabilityAccountId) {
    liabilityAccount = await loadEntityAccount({
      organizationId: resolvedOrganizationId,
      entityId: resolvedEntityId,
      accountId: liabilityAccountId,
      label: "Customer Deposit Liability Account",
    });
  }

  const technicalMappingConsistent = Boolean(
    technicalAccounts &&
    resolvedRules.every(({ definition, rule }) => {
      if (!rule) return false;
      const expected = definition.technicalAccount === "bank"
        ? technicalAccounts.bankAccountId
        : technicalAccounts.receivableAccountId;
      return String(technicalAccountFromRule(definition, rule) || "") === expected;
    })
  );

  return {
    organization_id: resolvedOrganizationId,
    entity_id: resolvedEntityId,
    effective_date: resolvedEffectiveDate,
    configured: configurationConsistent && technicalMappingConsistent,
    liability_account_id: liabilityAccountId,
    liability_account: liabilityAccount
      ? {
          id: liabilityAccount.id,
          code: liabilityAccount.account_code,
          name: liabilityAccount.account_name,
        }
      : null,
    base_accounting_ready: baseAccountingReady,
    base_accounting_error: baseAccountingError,
    configuration_consistent: configurationConsistent,
    technical_mapping_consistent: technicalMappingConsistent,
  };
}

export async function setCustomerDepositLiabilityConfiguration({
  organizationId,
  entityId,
  liabilityAccountId,
  effectiveDate,
  configuredBy = null,
}) {
  const resolvedOrganizationId = required(organizationId, "organizationId");
  const resolvedEntityId = required(entityId, "entityId");
  const resolvedLiabilityAccountId = required(
    liabilityAccountId,
    "liabilityAccountId"
  );
  const resolvedEffectiveDate = normalizeDate(effectiveDate);

  await validateEntity({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
  });
  await validateLiabilityAccount({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    liabilityAccountId: resolvedLiabilityAccountId,
  });

  const technicalAccounts = await resolveTechnicalAccounts({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    effectiveDate: resolvedEffectiveDate,
  });

  if (
    resolvedLiabilityAccountId === technicalAccounts.bankAccountId ||
    resolvedLiabilityAccountId === technicalAccounts.receivableAccountId
  ) {
    throw new Error(
      "Customer Deposit Liability Account must be different from the bank-side and receivable accounts"
    );
  }

  await setEffectivePostingRules({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    effectiveDate: resolvedEffectiveDate,
    createdBy: configuredBy,
    rules: buildPostingRules({
      liabilityAccountId: resolvedLiabilityAccountId,
      ...technicalAccounts,
    }),
  });

  return getCustomerDepositLiabilityConfiguration({
    organizationId: resolvedOrganizationId,
    entityId: resolvedEntityId,
    effectiveDate: resolvedEffectiveDate,
  });
}

export default {
  getCustomerDepositLiabilityConfiguration,
  setCustomerDepositLiabilityConfiguration,
};
