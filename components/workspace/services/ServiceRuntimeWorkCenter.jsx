"use client";

import { useEffect, useMemo, useState } from "react";

import MasterDataWorkCenter from "@/components/workspace/master-data/MasterDataWorkCenter";
import {
  useBusinessContext,
} from "@/app/providers/BusinessContextProvider";


function cleanValue(value) {
  const normalized =
    String(value ?? "").trim();

  if (
    !normalized ||
    normalized === "undefined" ||
    normalized === "null"
  ) {
    return "";
  }

  return normalized;
}


export default function ServiceRuntimeWorkCenter({
  workspaceId,
  capability,
  organizationId,
  eyebrow,
}) {

  const [data,setData] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  const [query,setQuery] = useState("");
  const [selectedId,setSelectedId] = useState(null);

  const businessContext =
    useBusinessContext() || {};


  const runtime =
    capability?.ui?.runtime;


  const api =
    capability?.ui?.api;

  const contextCurrency =
    cleanValue(
      businessContext.currency ||
      businessContext.entity?.currency ||
      businessContext.organization?.default_currency
    );


  useEffect(()=>{

    async function load(){

      try {

        const params =
          new URLSearchParams({
            organization_id:
              organizationId,
          });

        if (contextCurrency) {
          params.set(
            "currency",
            contextCurrency
          );
        }

        const endpoint =
          `${api}?${params.toString()}`;


        const res =
          await fetch(endpoint);


        const json =
          await res.json();


        if (!json.success) {

          throw new Error(
            json.error || "Load failed"
          );

        }


        if (runtime === "wallet") {

          setData(
            json.wallet
              ? [
                  {
                    ...json.wallet,

                    name:
                      "Organization Wallet",

                    balance:
                      json.wallet.available_balance,

                    reserved:
                      json.wallet.reserved_balance,

                    display_status:
                      json.wallet.status,

                  }
                ]
              : []
          );

        } else {

          setData(
            json.usage || []
          );

        }


      } catch(err) {

        setError(
          err.message
        );

      } finally {

        setLoading(false);

      }

    }


    if (
      organizationId &&
      api
    ) {

      load();

    }


  },[
    organizationId,
    api,
    runtime,
    contextCurrency,
  ]);


  const filteredRows =
    useMemo(()=>{

      if (!query) {
        return data;
      }


      return data.filter(row =>
        JSON.stringify(row)
          .toLowerCase()
          .includes(
            query.toLowerCase()
          )
      );

    },[
      data,
      query,
    ]);


  const selected =
    filteredRows.find(
      row => row.id === selectedId
    )
    ||
    filteredRows[0]
    ||
    null;

  const resolvedEntityId =
    businessContext.entity_id ||
    businessContext.active_entity_id ||
    businessContext.entity?.id ||
    null;

  const resolvedCountry =
    businessContext.country ||
    businessContext.entity?.country ||
    businessContext.organization?.country ||
    null;

  const resolvedCurrency =
    contextCurrency ||
    selected?.currency ||
    null;


  const kpis =
    runtime === "wallet"

      ? [

          {
            label:"Available Balance",
            value:
              data[0]?.available_balance || 0,
            hint:
              data[0]?.currency || "",
          },

          {
            label:"Reserved",
            value:
              data[0]?.reserved_balance || 0,
            hint:
              "Reserved funds",
          },

          {
            label:"Currency",
            value:
              data[0]?.currency || "-",
            hint:
              "Wallet currency",
          },

          {
            label:"Status",
            value:
              data[0]?.status || "-",
            hint:
              "Wallet status",
          },

        ]

      : [

          {
            label:"Executions",
            value:
              data.length,
            hint:
              "Service usage records",
          },

          {
            label:"Supplier Cost",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.supplier_cost || 0
                  ),
                0
              ),
            hint:
              "Provider cost",
          },

          {
            label:"Customer Price",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.customer_price || 0
                  ),
                0
              ),
            hint:
              "Charged amount",
          },

          {
            label:"Margin",
            value:
              "-",
            hint:
              "Calculated margin",
          },

        ];


  return (

    <MasterDataWorkCenter

      organizationId={
        organizationId
      }

      entityId={
        resolvedEntityId
      }

      country={
        resolvedCountry
      }

      currency={
        resolvedCurrency
      }

      workspaceId={
        workspaceId
      }

      moduleKey={
        capability.id
      }

      eyebrow={
        eyebrow
      }

      title={
        capability.name
      }

      description={
        capability.description
      }

      primaryAction={
        capability.create
      }

      primaryActionLabel={
        capability.create?.label ||
        capability.create?.title ||
        ""
      }

      rows={
        filteredRows
      }

      loading={
        loading
      }

      error={
        error
      }

      query={
        query
      }

      onQueryChange={
        setQuery
      }

      selected={
        selected
      }

      selectedId={
        selected?.id
      }

      onSelect={
        setSelectedId
      }

      kpis={
        kpis
      }

      searchPlaceholder={
        `Search ${capability.name}...`
      }

      getName={
        row =>
          row.name ||
          row.provider ||
          row.capability ||
          row.operation ||
          capability.name
      }

      getSubtitle={
        row =>
          runtime === "wallet"

            ? [
                row.display_status ||
                row.status,

                row.currency,

                row.billing_policy,
              ].filter(Boolean)

            : [
                row.status,
                row.capability,
                row.operation,
              ].filter(Boolean)
      }

      getInitials={
        row =>
          String(
            row.name ||
            row.provider ||
            capability.name
          )
          .slice(0,2)
          .toUpperCase()
      }

      listMetrics={
        runtime === "wallet"

          ? [
              {
                label:"Balance",
                value:
                  row =>
                    row.balance ?? 0,
              },
              {
                label:"Reserved",
                value:
                  row =>
                    row.reserved ?? 0,
              },
              {
                label:"Currency",
                value:
                  row =>
                    row.currency || "-",
              },
              {
                label:"Status",
                value:
                  row =>
                    row.display_status ||
                    row.status ||
                    "-",
              },
            ]

          : [
              {
                label:"Provider",
                value:
                  row =>
                    row.provider ||
                    "-",
              },
              {
                label:"Capability",
                value:
                  row =>
                    row.capability ||
                    "-",
              },
              {
                label:"Cost",
                value:
                  row =>
                    row.supplier_cost ??
                    row.cost ??
                    "-",
              },
              {
                label:"Price",
                value:
                  row =>
                    row.customer_price ??
                    row.price ??
                    "-",
              },
            ]
      }

      detailSections={
        runtime === "wallet"

          ? [
              {
                title:"Wallet Information",
                fields: selected
                  ? [
                      {
                        label:"Wallet ID",
                        value:()=>String(selected.id || "-"),
                      },
                      {
                        label:"Organization ID",
                        value:()=>String(selected.organization_id || "-"),
                      },
                      {
                        label:"Currency",
                        value:()=>String(selected.currency || "-"),
                      },
                      {
                        label:"Balance",
                        value:()=>String(selected.balance ?? selected.available_balance ?? 0),
                      },
                      {
                        label:"Reserved Balance",
                        value:()=>String(selected.reserved ?? selected.reserved_balance ?? 0),
                      },
                      {
                        label:"Billing Policy",
                        value:()=>String(selected.billing_policy || "-"),
                      },
                      {
                        label:"Auto Top Up",
                        value:()=>String(selected.auto_topup ?? false),
                      },
                      {
                        label:"Status",
                        value:()=>String(selected.display_status || selected.status || "-"),
                      },
                      {
                        label:"Created",
                        value:()=>String(selected.created_at || "-"),
                      },
                      {
                        label:"Updated",
                        value:()=>String(selected.updated_at || "-"),
                      },
                    ]
                  : [],
              },
            ]

          : [
              {
                title:"Details",
                fields:
                  selected
                    ? Object.entries(selected)
                        .slice(0,20)
                        .map(([key,value])=>({
                          label:key,
                          value:()=>String(value ?? "")
                        }))
                    : [],
              },
            ]
      }

    />

  );

}
