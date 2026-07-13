"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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

function serviceStatusLabel(row) {

  const status =
    String(
      row?.status ||
      ""
    ).toUpperCase();

  if (
    status === "ACTIVE" ||
    status === "AVAILABLE"
  ) {
    return "Available";
  }

  if (
    status === "INCLUDED"
  ) {
    return "Included";
  }

  return status || "Unavailable";
}

function capabilitySummary(row) {

  const capabilities =
    row?.capabilities || [];


  if (!capabilities.length) {
    return "-";
  }


  return capabilities
    .map(item => {

      if (
        typeof item === "string"
      ) {
        return item;
      }


      return (
        item.business ||
        item.name ||
        "-"
      );

    })
    .join(", ");

}


function formatCapabilities(capabilities = []) {

  return capabilities
    .map(
      item =>
        typeof item === "string"
          ? item
          : item.business || item.name || "-"
    )
    .join(", ");

}



export default function ServiceRuntimeWorkCenter({
  workspaceId,
  capability,
  organizationId,
  eyebrow,
}) {

  const router =
    useRouter();

  if (!capability) {

    return (
      <div className="rounded-[32px] border border-red-400/30 bg-red-500/10 p-6 text-red-100">
        Missing service capability
      </div>
    );

  }

  const [data,setData] = useState([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");

  const [query,setQuery] = useState("");
  const [selectedId,setSelectedId] = useState(null);

  const [economics,setEconomics] =
    useState({
      usage:0,
      cost:0,
      executions:0,
    });

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

          setProviderDetails(null);

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

          const rowsKey =
            capability?.ui?.rowsKey ||
            "rows";


          setData(
            json[rowsKey] ||
            []
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


  useEffect(()=>{

    async function loadEconomics(){

      if (!organizationId) {
        return;
      }


      const params =
        new URLSearchParams({

          organization_id:
            organizationId,

        });


      if (
        runtime === "service_domains"
      ) {

        params.set(
          "domain",
          capability.name.toLowerCase()
        );

      }


      if (
        runtime === "service_domain_detail"
      ) {

        params.set(
          "domain",
          capability.domainId
        );

      }

      const res =
        await fetch(
          `/api/platform/services/economics?${params.toString()}`
        );


      const json =
        await res.json();


      if (json.success) {

        setEconomics(
          json.economics
        );

      }

    }


    loadEconomics();


  },[
    organizationId,
    runtime,
    capability,
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

      : runtime === "usage"

      ? [

          {
            label:"Executions",
            value:
              data.length,
            hint:
              "Service executions",
          },

          {
            label:"Usage Volume",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.quantity || 0
                  ),
                0
              ),
            hint:
              "Total usage",
          },

          {
            label:"Customer Charges",
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
            label:"Last Activity",
            value:
              data[0]?.created_at || "-",
            hint:
              "Latest execution",
          },

        ]

      : runtime === "service_domains"

      ? [

          {
            label:"Services",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.services || 0
                  ),
                0
              ),
            hint:
              "Avantiqo services",
          },

          {
            label:"Capabilities",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.capabilities || 0
                  ),
                0
              ),
            hint:
              "Available capabilities",
          },

          {
            label:"Usage",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.usage || 0
                  ),
                0
              ),
            hint:
              "Service executions",
          },

          {
            label:"Cost",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.cost || 0
                  ),
                0
              ),
            hint:
              "Customer consumption",
          },

        ]

      : runtime === "service_domain_detail"

      ? [

          {
            label:"Services",
            value:
              data.length,
            hint:
              "Available services",
          },

          {
            label:"Capabilities",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  (row.capabilities?.length || 0),
                0
              ),
            hint:
              "Available capabilities",
          },

          {
            label:"Usage",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.usage || 0
                  ),
                0
              ),
            hint:
              "Service usage",
          },

          {
            label:"Cost",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  Number(
                    row.cost || 0
                  ),
                0
              ),
            hint:
              "Customer consumption",
          },

        ]
      : [

          {
            label:"Services",
            value:
              data.length,
            hint:
              "Available services",
          },

          {
            label:"Capabilities",
            value:
              data.reduce(
                (sum,row)=>
                  sum +
                  (row.capabilities?.length || 0),
                0
              ),
            hint:
              "Available business functions",
          },

          {
            label:"Active",
            value:
              data.filter(
                row =>
                  row.status === "ACTIVE"
              ).length,
            hint:
              "Active services",
          },

          {
            label:"Available",
            value:
              data.filter(
                row =>
                  row.status === "ACTIVE" ||
                  row.status === "AVAILABLE"
              ).length,
            hint:
              "Available services",
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

      onRowSelect={

        runtime === "service_domains"

          ? row => {

              router.push(
                `/workspace/${organizationId}/services/connected-services/${row.id}`
              );

            }


        : runtime === "service_domain_detail"

          ? row => {

              router.push(
                `/workspace/${organizationId}/services/connected-services/${capability.domainId}/${row.id}`
              );

            }


        : undefined

      }

      kpis={
        kpis
      }



      menuActions={
        []
      }

      searchPlaceholder={
        `Search ${capability.name}...`
      }

      getName={
        row =>
          row.name ||
          row.name ||
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

          : runtime === "usage"

          ? [
              row.status,
              row.capability,
              row.operation,
            ].filter(Boolean)

          : runtime === "service_domains"

          ? [
              `${row.capabilities || 0} capabilities`,
              `${row.capabilities || 0} capabilities`,
            ].filter(Boolean)

          : runtime === "service_domain_detail"

          ? [
              ...(row.capabilities || [])
                .map(
                  item =>
                    typeof item === "string"
                      ? item
                      : item.business || item.name
                )
            ].filter(Boolean)

          : runtime === "service_domain_detail"

          ? [
              {
                title:"Service Details",
                fields: selected
                  ? [
                      {
                        label:"Service",
                        value:()=>String(selected.name || "-"),
                      },
                      {
                        label:"Capabilities",
                        value:()=>(
                          formatCapabilities(
                            selected.capabilities || []
                          )
                        ),
                      },
                      {
                        label:"Status",
                        value:()=>String(selected.status || "-"),
                      },
                      {
                        label:"Service Status",
                        value:()=>serviceStatusLabel(selected),
                      },
                      {
                        label:"Health",
                        value:()=>String(selected.availability || "-"),
                      },

                      {
                        label:"Usage",
                        value:()=>String(
                          economics.usage || 0
                        ),
                      },

                      {
                        label:"Customer Cost",
                        value:()=>String(
                          economics.cost || 0
                        ),
                      },

                      {
                        label:"Executions",
                        value:()=>String(
                          economics.executions || 0
                        ),
                      },

                    ]
                  : [],
              },
            ]

          : [
              row.category,
              row.status,
              serviceStatusLabel(row),
            ].filter(Boolean)

      }

      getInitials={
        row =>
          String(
            row.name ||
            row.name ||
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

          : runtime === "usage"

          ? [
              {
                label:"Service",
                value:
                  row =>
                    row.name || "-",
              },
              {
                label:"Capability",
                value:
                  row =>
                    row.capability || "-",
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

          : runtime === "service_domains"

          ? [

              {
                label:"Capabilities",
                value:
                  row =>
                    formatCapabilities(
                      row.capabilities || []
                    ),
              },

              {
                label:"Services",
                value:
                  row =>
                    formatCapabilities(
                      row.capabilities || []
                    ),
              },

              {
                label:"Usage",
                value:
                  row =>
                    row.usage || 0,
              },

              {
                label:"Cost",
                value:
                  row =>
                    row.cost || 0,
              },

            ]

          : runtime === "service_domain_detail"

          ? [

              {
                label:"Capabilities",
                value:
                  row =>
                    formatCapabilities(
                      row.capabilities || []
                    ) || "-",
              },

              {
                label:"Status",
                value:
                  row =>
                    row.status || "-",
              },

              {
                label:"Active",
                value:
                  row =>
                    row.status === "ACTIVE"
                      ? "YES"
                      : "NO",
              },

              {
                label:"Health",
                value:
                  row =>
                    row.availability || "-",
              },

            ]

          : [
              {
                label:"Category",
                value:
                  row =>
                    row.category || "-",
              },
              {
                label:"Capabilities",
                value:
                  row =>
                    capabilitySummary(row),
              },
              {
                label:"Status",
                value:
                  row =>
                    row.status || "-",
              },
              {
                label:"Service Status",
                value:
                  row =>
                    serviceStatusLabel(row),
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

          : runtime === "services"

          ? [
              {
                title:"Service Details",
                fields: selected
                  ? [
                      {
                        label:"Service",
                        value:()=>String(selected.name || selected.name || "-"),
                      },
                      {
                        label:"Category",
                        value:()=>String(selected.category || "-"),
                      },
                      {
                        label:"Capabilities",
                        value:()=>capabilitySummary(selected),
                      },
                      {
                        label:"Status",
                        value:()=>String(selected.status || "-"),
                      },
                      {
                        label:"Service Status",
                        value:()=>serviceStatusLabel(selected),
                      },
                      {
                        label:"Health",
                        value:()=>String(selected.availability || "-"),
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
