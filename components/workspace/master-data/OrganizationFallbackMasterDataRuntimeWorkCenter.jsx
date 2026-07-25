"use client";

import { useEffect, useMemo, useState } from "react";

import MasterDataWorkCenter, {
  initials,
} from "@/components/workspace/master-data/MasterDataWorkCenter";
import { getForm } from "@/lib/platform/forms";

function actionList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    return Object.entries(value).map(
      ([id, action]) => ({
        id,
        ...(action || {}),
      })
    );
  }

  return [];
}

function valueFromPath(row, path) {
  return String(path || "")
    .split(".")
    .reduce((value, key) => value?.[key], row);
}

function label(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function defaultName(row) {
  return (
    row?.legal_name ||
    row?.account_name ||
    row?.customer_name ||
    row?.vendor_name ||
    row?.period_name ||
    row?.code ||
    row?.name ||
    row?.title ||
    "Unnamed"
  );
}

function defaultSubtitle(row) {
  return [
    row?.status,
    row?.code,
    row?.country,
    row?.created_at,
  ]
    .filter(Boolean)
    .slice(0, 3);
}

function firstArrayPayload(json, preferredKey) {
  if (preferredKey && Array.isArray(json?.[preferredKey])) {
    return json[preferredKey];
  }

  for (const key of [
    "rows",
    "items",
    "records",
    "results",
    "data",
    "entities",
    "currencies",
    "paymentTerms",
    "periods",
    "accounts",
    "customers",
    "vendors",
  ]) {
    if (Array.isArray(json?.[key])) {
      return json[key];
    }
  }

  return [];
}

function isEntityRequirement(error, status) {
  const message = String(error || "").toLowerCase();

  return (
    [400, 409, 422].includes(status) &&
    (
      message.includes("entity") ||
      message.includes("legal entity")
    ) &&
    (
      message.includes("required") ||
      message.includes("select") ||
      message.includes("missing")
    )
  );
}

function detailSections(selected) {
  if (!selected) {
    return [];
  }

  const hiddenKeys = new Set([
    "id",
    "organization_id",
    "entity_id",
    "created_by",
    "updated_by",
  ]);

  const fields = Object.entries(selected)
    .filter(([key, value]) => (
      !hiddenKeys.has(key) &&
      !key.endsWith("_id") &&
      value !== null &&
      value !== undefined &&
      value !== "" &&
      typeof value !== "object"
    ))
    .slice(0, 18)
    .map(([key, value]) => ({
      label: label(key),
      value: () => String(value),
    }));

  return fields.length
    ? [{ title: "Details", fields }]
    : [];
}

function hasUsableCreate(create) {
  if (!create || create.enabled !== true) {
    return false;
  }

  return Boolean(
    create.schema?.length ||
    (create.form && getForm(create.form).length > 0) ||
    (create.engine && create.engine !== "create")
  );
}

export default function OrganizationFallbackMasterDataRuntimeWorkCenter({
  workspaceId,
  moduleKey,
  capability,
  eyebrow,
  organizationId,
  periodId,
}) {
  const config = capability?.ui || {};
  const normalizedKey = capability?.id || moduleKey;

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [entityRequired, setEntityRequired] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      setEntityRequired(false);

      try {
        if (!organizationId) {
          throw new Error("Select an organisation to load this workspace.");
        }

        if (!config.api) {
          setRows([]);
          return;
        }

        const url = new URL(
          config.api,
          window.location.origin
        );

        url.searchParams.set(
          "organizationId",
          organizationId
        );

        if (periodId) {
          url.searchParams.set(
            "periodId",
            periodId
          );
        }

        if (workspaceId) {
          url.searchParams.set(
            "workspaceId",
            workspaceId
          );
        }

        if (normalizedKey) {
          url.searchParams.set(
            "capabilityId",
            normalizedKey
          );
        }

        Object.entries(config.filters || {})
          .forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              url.searchParams.set(key, value);
            }
          });

        const response = await fetch(
          url.toString(),
          { cache: "no-store" }
        );

        let json = {};

        try {
          json = await response.json();
        } catch {
          json = {};
        }

        if (!response.ok || json?.success === false) {
          const message =
            json?.error ||
            "Workspace load failed";

          if (isEntityRequirement(message, response.status)) {
            setEntityRequired(true);
            throw new Error(
              "Select a legal entity to open this workspace."
            );
          }

          throw new Error(message);
        }

        if (!active) {
          return;
        }

        setRows(
          firstArrayPayload(
            json,
            config.rowsKey
          )
        );
      } catch (loadError) {
        if (active) {
          setRows([]);
          setError(
            loadError?.message ||
            "Workspace load failed"
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [
    organizationId,
    periodId,
    workspaceId,
    normalizedKey,
    refresh,
    config.api,
    config.rowsKey,
    config.filters,
  ]);

  const filteredRows = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    if (!normalizedQuery) {
      return rows;
    }

    const searchFields =
      config.search?.length
        ? config.search
        : rows[0]
          ? Object.keys(rows[0])
          : [];

    return rows.filter(row =>
      searchFields
        .map(key => valueFromPath(row, key))
        .filter(value => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [rows, query, config.search]);

  const selected =
    filteredRows.find(row => row.id === selectedId) ||
    filteredRows[0] ||
    null;

  const configuredCreate =
    capability?.create?.enabled === true
      ? capability.create
      : config.create?.enabled === true
        ? config.create
        : null;

  const usableCreate =
    !entityRequired &&
    hasUsableCreate(configuredCreate)
      ? configuredCreate
      : null;

  const topMenuActions = actionList(
    capability?.topMenu ||
    config.topMenu
  ).filter(action =>
    action?.type !== "create" ||
    Boolean(usableCreate)
  );

  const menuActions = actionList(
    capability?.rowMenu ||
    config.rowMenu ||
    capability?.actions
  );

  const activeCount = rows.filter(row =>
    row?.status === "active" ||
    row?.status === "ACTIVE" ||
    row?.is_active === true ||
    row?.active === true
  ).length;

  return (
    <MasterDataWorkCenter
      workspaceId={workspaceId}
      moduleKey={normalizedKey}
      organizationId={organizationId}
      entityId={null}
      periodId={periodId}
      context={{
        organization_id: organizationId,
        entity_id: null,
        period_id: periodId,
        workspace_id: workspaceId,
        capability_id: normalizedKey,
      }}
      onRefresh={() =>
        setRefresh(value => value + 1)
      }
      eyebrow={eyebrow || "Workspace"}
      title={capability?.name || "Records"}
      description={capability?.description || ""}
      primaryActionLabel={
        usableCreate
          ? usableCreate.label ||
            usableCreate.title ||
            "+ New"
          : ""
      }
      primaryAction={usableCreate}
      rows={filteredRows}
      loading={loading}
      error={error}
      query={query}
      onQueryChange={setQuery}
      selected={selected}
      selectedId={selected?.id}
      onSelect={setSelectedId}
      menuId={menuId}
      onToggleMenu={setMenuId}
      searchPlaceholder={`Search ${String(capability?.name || "records").toLowerCase()}...`}
      getName={config.name || defaultName}
      getInitials={row => initials(
        config.name
          ? config.name(row)
          : defaultName(row)
      )}
      getSubtitle={config.subtitle || defaultSubtitle}
      kpis={[
        {
          label: capability?.name || "Records",
          value: rows.length,
          hint: "Organisation records",
        },
        {
          label: "Active",
          value: activeCount,
          hint: "Active records",
        },
        {
          label: "Scope",
          value: entityRequired
            ? "Entity required"
            : "Organisation",
          hint: entityRequired
            ? "Select a legal entity"
            : "Organisation-level data",
        },
        {
          label: "Selected",
          value: selected ? "1" : "0",
          hint: "Current record",
        },
      ]}
      listMetrics={config.listMetrics || []}
      detailSections={
        config.detailSections?.length
          ? config.detailSections
          : detailSections(selected)
      }
      topMenuActions={topMenuActions}
      menuActions={menuActions}
    />
  );
}
