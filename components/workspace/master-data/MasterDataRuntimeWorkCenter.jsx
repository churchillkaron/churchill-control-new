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

import ReportWorkCenter from "@/components/workspace/reports/ReportWorkCenter";

import {
  getWorkspaceItemByWorkspace,
} from "@/lib/platform/registry/erpRegistry";
import { getForm } from "@/lib/platform/forms";

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
    row?.task_type ||
    row?.source_document ||
    row?.code ||
    row?.name ||
    row?.title ||
    "Unnamed"
  );
}

function defaultSubtitle(row) {
  return [
    row?.status,

    row?.["Assigned To"],

    row?.["Created At"] ||
    row?.created_at,

    row?.code,
    row?.account_code,
    row?.invoice_number,
    row?.vendor_name,
    row?.customer_name,

  ]
    .filter(Boolean)
    .slice(0, 3);
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

async function readJsonResponse(response, fallbackMessage) {
  if (!response || typeof response.json !== "function") {
    throw new Error(fallbackMessage);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

function formatDetailValue(key, value, row) {

  if (
    key.endsWith("_id") &&
    value
  ) {

    const lookup = {

      item_id:
        row.item_name ||
        row.item ||
        row.product_name,

      warehouse_id:
        row.warehouse_name ||
        row.warehouse,

      location_id:
        row.location_name ||
        row.location,

      customer_id:
        row.customer_name,

      vendor_party_id:
        row.vendor_name ||
        row.vendor,

    };


    if (lookup[key]) {
      return lookup[key];
    }

  }


  return String(value);

}



function defaultDetailSections(selected) {

  if (!selected) {
    return [];
  }


  const hiddenKeys = new Set([

    "id",

    "organization_id",

    "entity_id",

    "assigned_to",

    "created_by",

    "started_by",

    "completed_by",

    "updated_by",

    "party_id",

    "staff_id",

  ]);


  const entries =
    Object.entries(selected)
      .filter(([key, value]) => {

        if (hiddenKeys.has(key)) {
          return false;
        }


        if (
          key.endsWith("_id")
        ) {
          return false;
        }


        return (
          value !== null &&
          value !== undefined &&
          value !== "" &&
          typeof value !== "object"
        );

      })
      .slice(0, 18);


  return [
    {
      title:"Details",

      fields:
        entries.map(([key,value]) => ({

          label:
            label(key),

          value:() =>
            formatDetailValue(
              key,
              value,
              selected
            ),

        })),

    },
  ];

}

function resolveMenuActions(capability, config, workspaceId) {
  const actionList = value =>
    Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.entries(value).map(([id, action]) => ({ id, ...action }))
        : [];

  const capabilityRowMenu =
    actionList(capability?.rowMenu);

  const configRowMenu =
    actionList(config?.rowMenu);

  const capabilityActions =
    actionList(capability?.actions);

  const configActions =
    actionList(config?.actions);


  const businessActions =
    capabilityActions.length
      ? capabilityActions
      : configActions;


  const defaultActions =
    capabilityRowMenu.length
      ? capabilityRowMenu
      : configRowMenu;


  const merged = [
    ...businessActions,
    ...defaultActions,
  ];


  const seen = new Set();

  const financeCreate =
    workspaceId === "finance" && capability?.create?.enabled === true
      ? capability.create
      : null;

  const normalized =
    merged
    .filter(action => {

      if (
        workspaceId === "finance" &&
        ["edit", "duplicate", "delete", "archive"].includes(action?.type) &&
        !action?.endpoint &&
        !action?.api &&
        !action?.capability &&
        !(
          financeCreate?.form &&
          ["edit", "duplicate"].includes(action?.type)
        )
      ) {
        return false;
      }

      const key =
        String(
          action?.action ||
          action?.id ||
          action?.label ||
          action?.type ||
          ""
        )
        .toLowerCase()
        .replace(/-/g, "_");


      if (!key) {
        return true;
      }


      if (seen.has(key)) {
        return false;
      }


      seen.add(key);

      return true;

    })
    .map(action => {
      if (financeCreate?.form && action?.type === "edit") {
        return {
          ...financeCreate,
          ...action,
          id: "edit",
          type: "capability",
          engine: "create",
          label: `Edit ${capability?.document || capability?.name || "Record"}`,
          title: `Edit ${capability?.document || capability?.name || "Record"}`,
        };
      }

      if (financeCreate?.form && action?.type === "duplicate") {
        return {
          ...financeCreate,
          ...action,
          id: "duplicate",
          type: "capability",
          engine: "create",
          label: `Duplicate ${capability?.document || capability?.name || "Record"}`,
          title: `Duplicate ${capability?.document || capability?.name || "Record"}`,
        };
      }

      return action;
    });


  if (!normalized.length) {
    return [];
  }


  return normalized;
}

function resolveTopMenuActions(capability, config, workspaceId) {
  const actionList = value =>
    Array.isArray(value)
      ? value
      : value && typeof value === "object"
        ? Object.entries(value).map(([id, action]) => ({ id, ...action }))
        : [];

  const configured = [
    ...actionList(capability?.topMenu),
    ...actionList(config?.topMenu),
  ];

  if (workspaceId !== "finance") return configured;

  const additions = [];
  const pageActions = actionList(capability?.actions)
    .filter(action => ["report", "runtime", "workflow"].includes(action?.type));
  const canCreate =
    capability?.create?.enabled === true &&
    (
      capability.create.schema?.length > 0 ||
      (capability.create.form && getForm(capability.create.form).length > 0) ||
      (capability.create.engine && capability.create.engine !== "create")
    );
  if (canCreate) additions.push({ id: "new", type: "create", label: capability.create.label || "+ New" });
  if (
    !pageActions.some(action => action?.type === "report" || action?.type === "reports") &&
    (capability?.analytics?.reports?.length || capability?.data?.report || capability?.data?.statements)
  ) additions.push({ id: "reports", type: "reports", label: "Reports" });

  const seen = new Set();
  return [...configured, ...pageActions, ...additions].filter(action => {
    if (["import", "export"].includes(action?.type)) return false;
    if (action?.type === "create" && !canCreate) return false;
    if (
      !["create", "report", "reports", "export", "import"].includes(action?.type) &&
      !action?.endpoint &&
      !action?.api &&
      !action?.href &&
      !action?.engine
    ) return false;
    const key = action?.id || action?.type || action?.label;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    businessContext.organization_id ||
    businessContext.organization?.id ||
    businessContext.organizationId ||
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

  const resolvedCapability =
    capability ||
    getWorkspaceItemByWorkspace(workspaceId, moduleKey) ||
    getWorkspaceItemByWorkspace(workspaceId, normalizeKey(moduleKey));

  if (!resolvedCapability) {
    notFound();
  }


  if (
    resolvedCapability?.runtime?.renderer ===
    "ReportWorkCenter"
  ) {

    return (

      <ReportWorkCenter

        capability={
          resolvedCapability
        }

        organizationId={
          resolvedOrganizationId
        }

        entityId={
          resolvedEntityId || legalEntityId
        }

        periodId={
          resolvedPeriodId
        }

        workspaceId={
          workspaceId
        }

      />

    );

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

  const [selectedDetail, setSelectedDetail] =
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


        if (config.filters) {

          Object.entries(
            config.filters
          ).forEach(
            ([key,value]) => {

              url.searchParams.set(
                key,
                value
              );

            }
          );

        }


        console.log(
          "MASTER DATA LOAD URL",
          url.toString()
        );

        const res =
          await fetch(
            url.toString(),
            {
              cache:"no-store",
            }
          );


        const json =
          await readJsonResponse(
            res,
            "Load failed"
          );


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


        const loadedRows =
          firstArrayPayload(
            json || {},
            config.rowsKey
          );


        let readModelJson = {};

        try {

          const readModelResponse =
            await fetch(
              "/api/platform/read-model/list",
              {
                method:"POST",
                headers:{
                  "Content-Type":"application/json",
                },
                body:JSON.stringify({
                  rows:loadedRows,
                }),
              }
            );


          if (readModelResponse.ok) {

            readModelJson =
              await readJsonResponse(
                readModelResponse,
                "Read model failed"
              );

          }

        } catch (readModelError) {

          console.warn(
            "MASTER DATA READ MODEL FAILED",
            readModelError
          );

        }


        setRows(
          readModelJson.rows ||
          loadedRows
        );
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
      runtime.ready &&
      resolvedOrganizationId &&
      resolvedEntityId
    ) {
      load();
    }

    return () => {
      active = false;
    };
  }, [
    organizationId,
    resolvedOrganizationId,
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


  useEffect(() => {

    let active = true;


    async function resolveSelected() {

      if (!selected) {

        setSelectedDetail(null);

        return;

      }


      try {

        const response =
          await fetch(
            "/api/platform/read-model/detail",
            {
              method:"POST",
              headers:{
                "Content-Type":"application/json",
              },
              body:JSON.stringify({
                row:selected,
              }),
            }
          );


        const json =
          response?.ok
            ? await readJsonResponse(
                response,
                "Read model failed"
              )
            : {};


        if (active) {

          setSelectedDetail(
            json.row ||
            selected
          );

        }

      } catch {

        if (active) {

          setSelectedDetail(selected);

        }

      }

    }


    resolveSelected();


    return () => {

      active = false;

    };

  }, [
    selected?.id,
  ]);

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

  const configuredCreate =
    resolvedCapability.create?.enabled === true
      ? resolvedCapability.create
      : config.create?.enabled === true
        ? config.create
        : null;

  const usableCreate =
    configuredCreate &&
    (
      (configuredCreate.form && getForm(configuredCreate.form).length > 0) ||
      configuredCreate.engine && configuredCreate.engine !== "create" ||
      configuredCreate.schema?.length > 0
    )
      ? configuredCreate
      : null;

  async function startWarehouseTask(row) {

    if (
      normalizedKey !== "warehouse_tasks"
    ) {
      return;
    }


    try {

      console.log(
        "WAREHOUSE START PAYLOAD",
        {
          organization_id:
            resolvedOrganizationId,

          entity_id:
            resolvedEntityId ||
            legalEntityId,

          task_id:
            row.id,
        }
      );


      const response =
        await fetch(
          "/api/inventory/warehouse/tasks/start",
          {
            method:"POST",
            credentials:"include",
            headers:{
              "Content-Type":"application/json",
            },
            body:JSON.stringify({

              organization_id:
                resolvedOrganizationId,

              entity_id:
                resolvedEntityId ||
                legalEntityId,

              task_id:
                row.id,

            }),
          }
        );


      const result =
        await response.json();


      console.log(
        "WAREHOUSE START RESULT",
        {
          status:
            response.status,

          result,
        }
      );


      if (response.ok) {

        setRefresh(
          value => value + 1
        );

      }


    } catch(error) {

      console.error(
        "WAREHOUSE START FAILED",
        error
      );

    }

  }


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
        usableCreate
          ? (
              usableCreate.label ||
              usableCreate.title ||
              "+ New"
            )
          : ""
      }
      primaryAction={usableCreate}
      rows={filteredRows}
      loading={loading}
      error={error}
      query={query}
      onQueryChange={setQuery}
      selected={
        selectedDetail ||
        selected
      }
      selectedId={selected?.id}
      onSelect={setSelectedId}

      onRowSelect={
        row =>
          startWarehouseTask(row)
      }

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
          : defaultDetailSections(
              selectedDetail ||
              selected
            )
      }
      topMenuActions={
        resolveTopMenuActions(
          resolvedCapability,
          config,
          workspaceId
        )
      }
      menuActions={
        resolveMenuActions(
          resolvedCapability,
          config,
          workspaceId
        )
      }
    />
  );
}
