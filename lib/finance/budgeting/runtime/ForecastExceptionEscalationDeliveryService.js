import {
  deliverForecastExceptionEscalation,
  listActiveForecastExceptionEscalations,
  listForecastEscalationManagers,
  listForecastExceptionDeliveryOrganizations,
  syncForecastExceptionEscalationsForDelivery,
} from "../repositories/ForecastExceptionEscalationDeliveryRepository";

function recipientPolicy(caseRow, managers) {
  const recipients = new Map();
  const add = (id, kind) => {
    const normalized = String(id || "").trim();
    if (!normalized) return;
    const existing = recipients.get(normalized);
    if (!existing || kind === "ASSIGNEE") {
      recipients.set(normalized, { id: normalized, kind });
    }
  };

  const level = String(caseRow.escalation_level || "NONE").toUpperCase();
  const reason = String(caseRow.escalation_reason || "").toUpperCase();
  const assignedTo = caseRow.assigned_to || null;

  if (level === "ATTENTION") {
    if (reason === "DUE_TODAY" && assignedTo) {
      add(assignedTo, "ASSIGNEE");
    } else if (reason === "UNASSIGNED" || reason === "UNASSIGNED_DUE_TODAY") {
      for (const manager of managers) add(manager.id, "FINANCE_MANAGER");
    } else if (assignedTo) {
      add(assignedTo, "ASSIGNEE");
    } else {
      for (const manager of managers) add(manager.id, "FINANCE_MANAGER");
    }
  }

  if (level === "ESCALATED") {
    if (assignedTo) add(assignedTo, "ASSIGNEE");
    for (const manager of managers) add(manager.id, "FINANCE_MANAGER");
  }

  if (level === "CRITICAL") {
    for (const manager of managers) add(manager.id, "FINANCE_MANAGER");
  }

  return [...recipients.values()];
}

async function processOrganization(organizationId) {
  const summary = {
    organization_id: organizationId,
    cases_evaluated: 0,
    active_escalations: 0,
    recipients_targeted: 0,
    deliveries_created: 0,
    idempotent_deliveries: 0,
    delivery_errors: 0,
    cases_without_recipients: 0,
  };

  await syncForecastExceptionEscalationsForDelivery({ organizationId });

  const [cases, managers] = await Promise.all([
    listActiveForecastExceptionEscalations({ organizationId }),
    listForecastEscalationManagers({ organizationId }),
  ]);

  summary.cases_evaluated = cases.length;
  summary.active_escalations = cases.length;

  for (const caseRow of cases) {
    const recipients = recipientPolicy(caseRow, managers);
    if (!recipients.length) {
      summary.cases_without_recipients += 1;
      continue;
    }

    summary.recipients_targeted += recipients.length;

    for (const recipient of recipients) {
      try {
        const result = await deliverForecastExceptionEscalation({
          organizationId,
          caseId: caseRow.id,
          escalationRevision: caseRow.escalation_revision,
          recipientUserId: recipient.id,
          recipientKind: recipient.kind,
        });
        if (result?.delivered) summary.deliveries_created += 1;
        else if (result?.idempotent) summary.idempotent_deliveries += 1;
      } catch {
        summary.delivery_errors += 1;
      }
    }
  }

  return summary;
}

export async function processForecastExceptionEscalationDeliveries({
  organizationId = null,
} = {}) {
  const organizationIds = organizationId
    ? [organizationId]
    : await listForecastExceptionDeliveryOrganizations();

  const result = {
    success: true,
    organizations_evaluated: 0,
    organizations_failed: 0,
    cases_evaluated: 0,
    active_escalations: 0,
    recipients_targeted: 0,
    deliveries_created: 0,
    idempotent_deliveries: 0,
    delivery_errors: 0,
    cases_without_recipients: 0,
  };

  for (const id of organizationIds) {
    try {
      const organization = await processOrganization(id);
      result.organizations_evaluated += 1;
      result.cases_evaluated += organization.cases_evaluated;
      result.active_escalations += organization.active_escalations;
      result.recipients_targeted += organization.recipients_targeted;
      result.deliveries_created += organization.deliveries_created;
      result.idempotent_deliveries += organization.idempotent_deliveries;
      result.delivery_errors += organization.delivery_errors;
      result.cases_without_recipients += organization.cases_without_recipients;
    } catch {
      result.organizations_failed += 1;
    }
  }

  result.success = result.organizations_failed === 0 && result.delivery_errors === 0;
  result.processed_at = new Date().toISOString();
  return result;
}
