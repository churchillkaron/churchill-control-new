"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import {
  useOrganizationRuntime,
} from "@/lib/hooks/useOrganizationRuntime";

import {
  useBusinessContext,
} from "@/app/providers/BusinessContextProvider";
import MasterDataWorkCenter, {
  formatMoney,
  initials,
} from "@/components/workspace/master-data/MasterDataWorkCenter";
import {
  getWorkspaceItemByWorkspace,
} from "@/lib/platform/registry/erpRegistry";

function normalizeKey(input) {
  return String(input || "")
    .replace(/_/g, "-");
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
    .replace(/\b\w/g, c => c.toUpperCase());
}

function defaultName(row) {
  return (
    row?.customer_name ||
    row?.vendor_name ||
    row?.account_name ||
    row?.bank_name ||
    row?.legal_name ||
    row?.period_name ||
    row?.provider_name ||
    row?.service_name ||
    row?.invoice_number ||
    row?.journal_number ||
    row?.purchase_order_number ||
    row?.receipt_number ||
    row?.reference_number ||
    row?.transaction_number ||
    row?.asset_number ||
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
    row?.account_code,
    row?.invoice_number,
    row?.vendor_name,
    row?.customer_name,
    row?.created_at,
  ].filter(Boolean).slice(0, 3);
}

function defaultActiveCount(rows) {
  return rows.filter(
    row =>
      row.status === "ACTIVE" ||
      row.status === "active" ||
      row.status === "enabled" ||
      row.is_active === true ||
      row.active === true
  ).length;
}

function defaultTotalValue(rows) {
  return rows.reduce(
    (sum, row) =>
      sum +
      Number(
        row.current_balance ||
        row.balance ||
        row.open_balance ||
        row.budget_amount ||
        row.total_amount ||
        row.total_spent ||
        row.share_capital ||
        row.amount ||
        row.taxPayable ||
        0
      ),
    0
  );
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
    "transactions",
    "payables",
    "receivables",
    "reports",
    "entries",
    "journals",
    "invoices",
    "payments",
    "assets",
    "budgets",
    "periods",
    "issues",
    "kpis",
    "events",
    "matches",
    "purchaseOrders",
    "receipts",
  ]) {
    if (Array.isArray(json?.[key])) {
      return json[key];
    }
  }

  return [];
}

function defaultDetailSections(selected) {
  if (!selected) {
    return [];
  }

  const entries =
    Object.entries(selected)
      .filter(([_, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        typeof value !== "object"
      )
      .slice(0, 18);

  return [
    {
      title: "Details",
      fields: entries.map(([key, value]) => ({
        label: label(key),
        value: () => String(value),
      })),
    },
  ];
}

export default function MasterDataRuntimeWorkCenter({
  workspaceId,
  moduleKey,
  capability,
  eyebrow,

  organizationId,
  entityId,
  legalEntityId,
  periodId,

}) {
  if (!workspaceId) {
    throw new Error("workspaceId is required");
  }

  const runtime =
    useOrganizationRuntime();

  const businessContext =
    useBusinessContext() || {};

  const resolvedOrganizationId =
    organizationId ||
    runtime.organization_id ||
    runtime.organization?.id ||
    null;

  const resolvedEntityId =
    entityId ||
    runtime.entity_id ||
    runtime.entity?.id ||
    businessContext.entity_id ||
    businessContext.entity?.id ||
    null;

  const resolvedPeriodId =
    periodId ||
    runtime.period_id ||
    runtime.period?.id ||
    null;

  console.log(
    "MASTER DATA CONTEXT",
    {
      organizationId,
      resolvedOrganizationId,
      entityId,
      resolvedEntityId,
      periodId,
      resolvedPeriodId,
    }
  );

  const resolvedCapability =
    capability ||
    getWorkspaceItemByWorkspace(workspaceId, moduleKey) ||
    getWorkspaceItemByWorkspace(workspaceId, normalizeKey(moduleKey));

  if (!resolvedCapability) {
    notFound();
  }

  const normalizedKey =
    resolvedCapability.id ||
    moduleKey;

  const config =
    resolvedCapability?.ui || {};

  const [loading, setLoading] =
    useState(true);

  const [rows, setRows] =
    useState([]);

  const [error, setError] =
    useState("");

  const [query, setQuery] =
    useState("");

  const [selectedId, setSelectedId] =
    useState(null);

  const [menuId, setMenuId] =
    useState(null);

  const [refresh, setRefresh] =
    useState(0);

  const [runtimeData, setRuntimeData] =
    useState({});

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        if (!config.api) {
          setRuntimeData({});
          setRows([]);
          return;
        }

        const url =
          new URL(
            config.api,
            window.location.origin
          );


        url.searchParams.set(
          "organizationId",
          resolvedOrganizationId
        );


        if (resolvedEntityId || legalEntityId) {

          url.searchParams.set(
            "entityId",
            resolvedEntityId || legalEntityId
          );

        }


        if (resolvedPeriodId) {

          url.searchParams.set(
            "periodId",
            resolvedPeriodId
          );

        }


        url.searchParams.set(
          "workspaceId",
          workspaceId
        );


        url.searchParams.set(
          "capabilityId",
          normalizedKey
        );


        const res =
          await fetch(
            url.toString(),
            {
              cache:"no-store",
            }
          );


        const json =
          await res.json();


        if (!res.ok) {

          throw new Error(
            json?.error ||
            "Load failed"
          );

        }

        if (!active) {
          return;
        }

        if (json?.success === false) {
          throw new Error(
            json.error ||
            "Load failed"
          );
        }

        setRuntimeData(json || {});
        setRows(firstArrayPayload(json || {}, config.rowsKey));
      } catch (error) {
        if (active) {
          console.error(error);
          setError(error.message || "Load failed");
          setRuntimeData({});
          setRows([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    if (
      resolvedOrganizationId
    ) {
      load();
    }

    return () => {
      active = false;
    };
  }, [
    organizationId,
    entityId,
    legalEntityId,
    periodId,
    workspaceId,
    normalizedKey,
    refresh,
    config.api,
    config.rowsKey,
  ]);

  const filteredRows =
    useMemo(() => {
      const q =
        query.trim().toLowerCase();

      if (!q) {
        return rows;
      }

      const searchFields =
        config.search && config.search.length
          ? config.search
          : rows[0]
            ? Object.keys(rows[0])
            : [];

      return rows.filter(row =>
        searchFields
          .map(key =>
            valueFromPath(row, key)
          )
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }, [
      rows,
      query,
      config.search,
    ]);

  const selected =
    filteredRows.find(
      row => row.id === selectedId
    ) ||
    filteredRows[0] ||
    null;

  const totalValue =
    defaultTotalValue(rows);

  const resolvedEyebrow =
    eyebrow ||
    "Finance";

  const resolvedKpis =
    config.kpis ||
    config.metrics ||
    [
      {
        label: resolvedCapability.name,
        value: rows.length,
        hint: "Records",
      },
      {
        label: "Active",
        value: defaultActiveCount(rows),
        hint: "Active records",
      },
      {
        label: "Total Value",
        value: formatMoney(totalValue),
        hint: "Combined value",
      },
      {
        label: "Selected",
        value: selected ? "1" : "0",
        hint: "Current record",
      },
    ];

  const mappedKpis =
    resolvedKpis.map(item => {
      if (item.value !== undefined) {
        return item;
      }

      if (item.key) {
        return {
          ...item,
          label: item.label || item.title || label(item.key),
          value:
            valueFromPath(runtimeData, item.key) ??
            valueFromPath(selected, item.key) ??
            "-",
        };
      }

      return {
        ...item,
        label: item.label || item.title || "-",
      };
    });

  console.log(
    "MASTER DATA SEND CONTEXT",
    {
      resolvedOrganizationId,
      resolvedEntityId,
      legalEntityId,
      resolvedPeriodId,
    }
  );

  return (
    <MasterDataWorkCenter
      workspaceId={workspaceId}
      moduleKey={normalizedKey}
      organizationId={resolvedOrganizationId}
      entityId={resolvedEntityId || legalEntityId}
      legalEntityId={resolvedEntityId || legalEntityId}
      periodId={resolvedPeriodId}
      context={{
        organization_id: resolvedOrganizationId,
        entity_id: resolvedEntityId || legalEntityId,
        period_id: resolvedPeriodId,
        workspace_id: workspaceId,
        capability_id: normalizedKey,
      }}
      onRefresh={() =>
        setRefresh(value => value + 1)
      }
      eyebrow={resolvedEyebrow}
      title={resolvedCapability.name}
      description={resolvedCapability.description}
      primaryActionLabel={
        (
          resolvedCapability.create?.enabled === true ||
          config.create?.enabled === true
        )
          ? (
              resolvedCapability.create?.label ||
              config.create?.label ||
              resolvedCapability.create?.title ||
              config.create?.title ||
              "+ New"
            )
          : ""
      }
      primaryAction={
        (
          resolvedCapability.create?.enabled === true
            ? resolvedCapability.create
            : config.create?.enabled === true
              ? config.create
              : null
        )
      }
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
      searchPlaceholder={`Search ${String(resolvedCapability.name || "records").toLowerCase()}...`}
      getName={
        config.name ||
        defaultName
      }
      getInitials={
        row =>
          initials(
            config.name
              ? config.name(row)
              : defaultName(row)
          )
      }
      getSubtitle={
        config.subtitle ||
        defaultSubtitle
      }
      kpis={mappedKpis}
      listMetrics={
        config.listMetrics ||
        []
      }
      detailSections={
        config.detailSections && config.detailSections.length
          ? config.detailSections
          : defaultDetailSections(selected)
      }
      topMenuActions={
        resolvedCapability.topMenu ||
        config.topMenu ||
        resolvedCapability.capabilities?.topMenu ||
        config.capabilities?.topMenu ||
        []
      }
      menuActions={
        resolvedCapability.rowMenu ||
        config.rowMenu ||
        resolvedCapability.actions ||
        config.actions ||
        []
      }
    />
  );
}
