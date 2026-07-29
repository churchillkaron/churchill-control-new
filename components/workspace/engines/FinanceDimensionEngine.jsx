"use client";

import { useEffect, useMemo, useRef } from "react";
import CreateEngine from "./CreateEngine";

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function FinanceDimensionEngine(props) {
  const values = props.values || {};
  const onChange = props.onChange;
  const initialized = useRef(false);

  useEffect(() => {
    if (!props.open) {
      initialized.current = false;
      return;
    }

    if (initialized.current || typeof onChange !== "function") return;
    initialized.current = true;

    if (!values.scope) onChange("scope", "ENTITY");
    if (!values.value_type) onChange("value_type", "LIST");
    if (!values.effective_from) onChange("effective_from", localDate());

    // A new dimension is open-ended unless the user explicitly ends it.
    if (values.effective_to) onChange("effective_to", "");
    if (values.required_on_posting === undefined) {
      onChange("required_on_posting", false);
    }
    if (values.allow_hierarchy === undefined) {
      onChange("allow_hierarchy", false);
    }
  }, [
    props.open,
    onChange,
    values.scope,
    values.value_type,
    values.effective_from,
    values.effective_to,
    values.required_on_posting,
    values.allow_hierarchy,
  ]);

  useEffect(() => {
    if (typeof onChange !== "function") return;

    if (values.scope === "ORGANISATION" && values.entity_id) {
      onChange("entity_id", "");
    }

    if (values.value_type !== "LIST" && values.allow_hierarchy) {
      onChange("allow_hierarchy", false);
    }
  }, [
    values.scope,
    values.entity_id,
    values.value_type,
    values.allow_hierarchy,
    onChange,
  ]);

  const fields = useMemo(() => {
    const result = [
      {
        name: "code",
        label: "Dimension Code",
        type: "text",
        required: true,
        placeholder: "Example: CHANNEL",
      },
      {
        name: "name",
        label: "Dimension Name",
        type: "text",
        required: true,
        placeholder: "Example: Sales Channel",
      },
      {
        name: "scope",
        label: "Scope",
        type: "select",
        required: true,
        options: [
          { value: "ENTITY", label: "Legal Entity" },
          { value: "ORGANISATION", label: "Organisation" },
        ],
      },
    ];

    if (values.scope === "ENTITY") {
      result.push({
        name: "entity_id",
        label: "Legal Entity",
        type: "lookup",
        lookup: "legal_entities",
        required: true,
      });
    }

    result.push({
      name: "value_type",
      label: "Value Type",
      type: "select",
      required: true,
      options: [
        { value: "LIST", label: "Controlled List" },
        { value: "TEXT", label: "Free Text" },
        { value: "NUMBER", label: "Number" },
        { value: "DATE", label: "Date" },
        { value: "BOOLEAN", label: "Yes / No" },
      ],
    });

    if (values.value_type === "LIST") {
      result.push({
        name: "allow_hierarchy",
        label: "Allow Parent / Child Values",
        type: "boolean",
        defaultValue: false,
      });
    }

    result.push(
      {
        name: "required_on_posting",
        label: "Required on Posting",
        type: "boolean",
        defaultValue: false,
      },
      {
        name: "effective_from",
        label: "Effective From",
        type: "date",
        required: true,
      },
      {
        name: "effective_to",
        label: "Effective To (Optional)",
        type: "date",
      },
      {
        name: "description",
        label: "Description (Optional)",
        type: "textarea",
        rows: 2,
        width: "full",
        placeholder: "Explain the reporting purpose only when the name is not self-explanatory.",
      }
    );

    return result;
  }, [values.scope, values.value_type]);

  const action = {
    ...(props.action || {}),
    form: "finance-dimension",
    api: "/api/finance/dimensions/upsert",
    endpoint: "/api/finance/dimensions/upsert",
    submitLabel: "Create Dimension",
  };

  return (
    <CreateEngine
      {...props}
      action={action}
      schema={fields}
      title="New Finance Dimension"
    />
  );
}
