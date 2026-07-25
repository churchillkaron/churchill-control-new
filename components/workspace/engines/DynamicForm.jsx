"use client";

import { useEffect, useMemo, useState } from "react";

import DynamicCustomerField from "./DynamicCustomerField";
import DynamicTableField from "./DynamicTableField";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-white outline-none";
const TEXTAREA_CLASS =
  "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none";
const LABEL_CLASS =
  "mb-2 block text-xs uppercase tracking-[0.25em] text-white/40";

function getWidthClass(width) {
  switch (width) {
    case "full":
      return "md:col-span-2";
    case "1/3":
      return "md:col-span-1";
    case "1/2":
    default:
      return "md:col-span-1";
  }
}

export default function DynamicForm({
  schema = [],
  values = {},
  onChange,
  organizationId,
  entityId,
}) {
  const fields = useMemo(
    () => schema.filter(Boolean),
    [schema]
  );

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      {fields.map(field => (
        <div
          key={field.name}
          className={getWidthClass(field.width)}
        >
          <FieldRenderer
            field={field}
            value={values[field.name]}
            values={values}
            onChange={onChange}
            organizationId={organizationId}
            entityId={entityId}
          />
        </div>
      ))}
    </div>
  );
}

function FieldRenderer({
  field,
  value,
  values,
  onChange,
  organizationId,
  entityId,
}) {
  switch (field.type) {
    case "customer":
      return (
        <DynamicCustomerField
          field={field}
          value={value}
          onChange={onChange}
          organizationId={organizationId}
        />
      );

    case "table":
      return (
        <DynamicTableField
          field={field}
          value={value}
          onChange={onChange}
          organizationId={organizationId}
          entityId={entityId}
        />
      );

    default:
      return (
        <PrimitiveField
          field={field}
          value={value}
          values={values}
          onChange={onChange}
          organizationId={organizationId}
          entityId={entityId}
        />
      );
  }
}

function PrimitiveField({
  field,
  value,
  onChange,
  organizationId,
  entityId,
}) {
  const label = (
    <label className={LABEL_CLASS}>
      {field.label}
      {field.required && (
        <span className="ml-1 text-orange-400">*</span>
      )}
    </label>
  );

  switch (field.type) {
    case "textarea":
      return (
        <>
          {label}
          <textarea
            rows={field.rows || 4}
            value={value || ""}
            placeholder={field.placeholder || ""}
            disabled={field.disabled}
            readOnly={field.readOnly}
            required={field.required}
            onChange={event =>
              onChange(field.name, event.target.value)
            }
            className={TEXTAREA_CLASS}
          />
        </>
      );

    case "select":
      if (field.source || field.lookup) {
        return (
          <LookupField
            field={field}
            value={value}
            onChange={onChange}
            organizationId={organizationId}
            entityId={entityId}
          />
        );
      }

      return (
        <>
          {label}
          <select
            value={value || ""}
            disabled={field.disabled}
            required={field.required}
            onChange={event =>
              onChange(field.name, event.target.value)
            }
            className={FIELD_CLASS}
          >
            <option value="">Select...</option>
            {(field.options || []).map(option => {
              const item = typeof option === "string"
                ? { value: option, label: option }
                : option;

              return (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              );
            })}
          </select>
        </>
      );

    case "lookup":
      return (
        <LookupField
          field={field}
          value={value}
          onChange={onChange}
          organizationId={organizationId}
          entityId={entityId}
        />
      );

    case "currency":
      return (
        <CurrencyField
          field={field}
          value={value}
          onChange={onChange}
          organizationId={organizationId}
          entityId={entityId}
        />
      );

    case "boolean":
      return (
        <>
          {label}
          <label className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4">
            <input
              type="checkbox"
              checked={!!value}
              onChange={event =>
                onChange(field.name, event.target.checked)
              }
            />
            <span className="text-sm text-white">
              {value ? "Enabled" : "Disabled"}
            </span>
          </label>
        </>
      );

    case "number":
      return (
        <>
          {label}
          <input
            type="number"
            value={value ?? ""}
            placeholder={field.placeholder || ""}
            disabled={field.disabled}
            readOnly={field.readOnly}
            required={field.required}
            min={field.min}
            max={field.max}
            step={field.step || "any"}
            onChange={event =>
              onChange(
                field.name,
                event.target.value === ""
                  ? ""
                  : Number(event.target.value)
              )
            }
            className={FIELD_CLASS}
          />
        </>
      );

    case "date":
    case "datetime-local":
    case "email":
    case "password":
    case "text":
    default:
      return (
        <>
          {label}
          <input
            type={field.type || "text"}
            value={value || ""}
            placeholder={field.placeholder || ""}
            disabled={field.disabled}
            readOnly={field.readOnly}
            required={field.required}
            onChange={event =>
              onChange(field.name, event.target.value)
            }
            className={FIELD_CLASS}
          />
        </>
      );
  }
}

function LookupField({
  field,
  value,
  onChange,
  organizationId,
  entityId,
}) {
  const [options, setOptions] = useState(
    Array.isArray(field.options) ? field.options : []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    if (Array.isArray(field.options) || (!field.lookup && !field.source)) {
      return undefined;
    }

    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      lookup: field.lookup || field.source,
      organizationId: organizationId || "",
      entityId: entityId || "",
    });

    fetch(`/api/platform/lookups?${params.toString()}`, {
      cache: "no-store",
    })
      .then(response => response.json())
      .then(payload => {
        if (!active) return;

        if (Array.isArray(payload)) {
          setOptions(payload);
          return;
        }

        setOptions([]);
        setError(payload?.error || "Lookup could not be loaded");
      })
      .catch(loadError => {
        if (!active) return;
        setOptions([]);
        setError(loadError?.message || "Lookup could not be loaded");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [field.lookup, field.source, field.options, organizationId, entityId]);

  return (
    <>
      <label className={LABEL_CLASS}>
        {field.label}
        {field.required ? (
          <span className="ml-1 text-orange-400">*</span>
        ) : null}
      </label>
      <select
        value={value || ""}
        disabled={loading || field.disabled}
        required={field.required}
        onChange={event =>
          onChange(field.name, event.target.value)
        }
        className={FIELD_CLASS}
      >
        <option value="">
          {loading ? "Loading..." : `Select ${field.label}`}
        </option>
        {options.map(option => {
          const item = typeof option === "string"
            ? { value: option, label: option }
            : option;

          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
      {error ? (
        <div className="mt-2 text-xs text-red-300">{error}</div>
      ) : null}
    </>
  );
}

function CurrencyField({
  field,
  value,
  onChange,
  organizationId,
  entityId,
}) {
  return (
    <LookupField
      field={{
        ...field,
        lookup:
          field.lookup ||
          field.source ||
          "currencies",
      }}
      value={value}
      onChange={onChange}
      organizationId={organizationId}
      entityId={entityId}
    />
  );
}
