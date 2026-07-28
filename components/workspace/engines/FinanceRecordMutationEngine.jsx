"use client";

import { useMemo, useState } from "react";

import CreateEngine from "@/components/workspace/engines/CreateEngine";

function initialFieldValue(field, row, duplicate) {
  const value = row?.[field.name];

  if (duplicate && field.name === "status") {
    return undefined;
  }

  if (
    field.name === "value_json" &&
    value &&
    typeof value === "object"
  ) {
    return JSON.stringify(value);
  }

  return value ?? (field.type === "table" ? [] : "");
}

function initialValues(schema, row, duplicate) {
  return Object.fromEntries(
    (schema || []).map(field => [
      field.name,
      initialFieldValue(field, row, duplicate),
    ])
  );
}

function missingRequiredFields(schema, values) {
  return (schema || [])
    .filter(field => {
      if (!field?.required) return false;
      const value = values?.[field.name];

      if (value === undefined || value === null || value === "") {
        return true;
      }

      if (Array.isArray(value)) {
        return value.length === 0;
      }

      return false;
    })
    .map(field => field.label || field.name);
}

export default function FinanceRecordMutationEngine({
  action,
  row,
  organizationId,
  entityId,
  periodId,
  moduleKey,
  onClose,
  onComplete,
}) {
  const schema = Array.isArray(action?.schema) ? action.schema : [];
  const duplicate = action?.type === "duplicate" || action?.id === "duplicate";
  const [values, setValues] = useState(() =>
    initialValues(schema, row, duplicate)
  );
  const [saving, setSaving] = useState(false);

  const title = useMemo(
    () => action?.title || action?.label || (duplicate ? "Duplicate Record" : "Edit Record"),
    [action, duplicate]
  );

  async function save() {
    const missing = missingRequiredFields(schema, values);

    if (missing.length) {
      window.alert(`Complete required fields: ${missing.join(", ")}`);
      return;
    }

    const endpoint = action?.endpoint || action?.api;

    if (!endpoint) {
      window.alert("Finance mutation endpoint is not configured.");
      return;
    }

    try {
      setSaving(true);
      const method = action?.method || (duplicate ? "POST" : "PATCH");
      const body = {
        ...values,
        organizationId,
        organization_id: organizationId,
        entityId: row?.entity_id || entityId || null,
        entity_id: row?.entity_id || entityId || null,
        periodId: row?.period_id || periodId || null,
        period_id: row?.period_id || periodId || null,
        ...(duplicate ? {} : { id: row?.id, record_id: row?.id }),
      };

      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));

      if (!response.ok || json?.success === false) {
        throw new Error(json?.error || json?.message || "Finance record save failed");
      }

      onComplete?.(json);
      onClose?.();
    } catch (error) {
      window.alert(error?.message || "Finance record save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CreateEngine
      open={true}
      title={title}
      schema={schema}
      values={values}
      onChange={(name, value) =>
        setValues(current => ({ ...current, [name]: value }))
      }
      onClose={onClose}
      onSave={save}
      saving={saving}
      organizationId={organizationId}
      entityId={row?.entity_id || entityId || null}
      moduleKey={moduleKey}
      action={action}
    />
  );
}
