"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

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


function safeArray(value) {

  return Array.isArray(value)
    ? value
    : [];

}


function safeNumber(value) {

  const number =
    Number(value || 0);


  return Number.isFinite(number)
    ? number
    : 0;

}


function formatList(values) {

  return safeArray(values)
    .map(value => {

      if (
        typeof value === "string"
      ) {
        return value;
      }


      return (
        value?.name ||
        value?.label ||
        value?.business ||
        value?.id ||
        "-"
      );

    })
    .filter(Boolean)
    .join(", ");

}


function titleCase(value) {

  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());

}



function serviceCount(row) {

  if (
    Number.isFinite(
      Number(row?.service_count)
    )
  ) {
    return Number(
      row.service_count
    );
  }


  if (
    Array.isArray(row?.service_names)
  ) {
    return row.service_names.length;
  }


  if (
    Array.isArray(row?.services)
  ) {
    return row.services.length;
  }


  return 0;

}


function capabilityCount(row) {

  if (
    Number.isFinite(
      Number(row?.capability_count)
    )
  ) {
    return Number(
      row.capability_count
    );
  }


  if (
    Array.isArray(row?.capability_names)
  ) {
    return row.capability_names.length;
  }


  if (
    Array.isArray(row?.capabilities)
  ) {
    return row.capabilities.length;
  }


  return 0;

}


function serviceNames(row) {

  if (
    Array.isArray(row?.service_names)
  ) {
    return row.service_names;
  }


  return safeArray(
    row?.services
  )
    .map(service =>
      typeof service === "string"
        ? service
        : service?.name
    )
    .filter(Boolean);

}


function serviceStatus(row) {

  const status =
    String(
      row?.status || ""
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


function sumRows(
  rows,
  field
) {

  return rows.reduce(
    (sum,row) =>
      sum +
      safeNumber(
        row?.[field]
      ),
    0
  );

}


export default function ServiceRuntimeWorkCenter({

  workspaceId,

  capability,

  organizationId,

  eyebrow,

}) {


  const router =
    useRouter();


  const businessContext =
    useBusinessContext() ||
    {};


  const runtime =
    capability?.ui?.runtime;


  const api =
    capability?.ui?.api;


  const [rows,setRows] =
    useState([]);


  const [loading,setLoading] =
    useState(true);


  const [error,setError] =
    useState("");


  const [query,setQuery] =
    useState("");


  const [selectedId,setSelectedId] =
    useState(null);


  const contextCurrency =
    cleanValue(
      businessContext.currency ||
      businessContext.entity?.currency ||
      businessContext.organization?.default_currency
    );


  const entityId =
    businessContext.entity_id ||
    businessContext.active_entity_id ||
    businessContext.entity?.id ||
    null;


  const country =
    businessContext.country ||
    businessContext.entity?.country ||
    businessContext.organization?.country ||
    null;


  useEffect(()=>{

    let cancelled =
      false;


    async function load(){

      if (
        !organizationId ||
        !api
      ) {

        setRows([]);
        setLoading(false);

        return;

      }


      setLoading(true);
      setError("");


      try {

        const params =
          new URLSearchParams({

            organization_id:
              organizationId,

          });


        if (
          contextCurrency
        ) {

          params.set(
            "currency",
            contextCurrency
          );

        }


        const response =
          await fetch(
            `${api}?${params.toString()}`
          );


        const json =
          await response.json()
            .catch(() => ({}));


        if (
          !response.ok ||
          !json.success
        ) {

          throw new Error(
            json.error ||
            json.message ||
            "Service data load failed"
          );

        }


        let nextRows =
          [];


        if (
          runtime === "wallet"
        ) {

          nextRows =
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
                  },
                ]
              : [];

        } else {

          const rowsKey =
            capability?.ui?.rowsKey ||
            "rows";


          nextRows =
            safeArray(
              json[rowsKey]
            );

        }


        if (
          cancelled
        ) {
          return;
        }


        setRows(
          nextRows
        );


        setSelectedId(
          current => {

            if (
              current &&
              nextRows.some(
                row =>
                  row.id === current
              )
            ) {
              return current;
            }


            return (
              nextRows[0]?.id ||
              null
            );

          }
        );


      } catch(loadError) {

        if (
          cancelled
        ) {
          return;
        }


        setRows([]);
        setError(
          loadError.message
        );

      } finally {

        if (
          !cancelled
        ) {
          setLoading(false);
        }

      }

    }


    load();


    return ()=>{

      cancelled =
        true;

    };

  },[
    organizationId,
    api,
    runtime,
    contextCurrency,
    capability?.ui?.rowsKey,
  ]);


  const filteredRows =
    useMemo(()=>{

      const normalizedQuery =
        query
          .trim()
          .toLowerCase();


      if (
        !normalizedQuery
      ) {
        return rows;
      }


      return rows.filter(row => {

        const searchable =
          [
            row?.name,
            row?.description,
            row?.status,
            row?.package,
            ...serviceNames(row),
          ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();


        return searchable.includes(
          normalizedQuery
        );

      });

    },[
      rows,
      query,
    ]);


  const selected =
    filteredRows.find(
      row =>
        row.id === selectedId
    )
    ||
    filteredRows[0]
    ||
    null;


  const isDomains =
    runtime ===
    "service_domains";


  const isServiceDetail =
    runtime ===
    "service_domain_detail";


  const isWallet =
    runtime ===
    "wallet";


  const isUsage =
    runtime ===
    "usage";


  const kpis =
    isWallet

      ? [

          {
            label:
              "Available Balance",

            value:
              safeNumber(
                rows[0]?.available_balance
              ),

            hint:
              rows[0]?.currency ||
              "",
          },

          {
            label:
              "Reserved",

            value:
              safeNumber(
                rows[0]?.reserved_balance
              ),

            hint:
              "Reserved funds",
          },

          {
            label:
              "Currency",

            value:
              rows[0]?.currency ||
              "-",

            hint:
              "Wallet currency",
          },

          {
            label:
              "Status",

            value:
              rows[0]?.status ||
              "-",

            hint:
              "Wallet status",
          },

        ]

      : isUsage

      ? [

          {
            label:
              "Executions",

            value:
              rows.length,

            hint:
              "Service executions",
          },

          {
            label:
              "Usage",

            value:
              sumRows(
                rows,
                "quantity"
              ),

            hint:
              "Total usage",
          },

          {
            label:
              "Charges",

            value:
              sumRows(
                rows,
                "customer_price"
              ),

            hint:
              "Customer charges",
          },

          {
            label:
              "Last Activity",

            value:
              rows[0]?.created_at ||
              "-",

            hint:
              "Latest execution",
          },

        ]

      : isDomains

      ? [

          {
            label:
              "Service Categories",

            value:
              rows.length,

            hint:
              "Available categories",
          },

          {
            label:
              "Services",

            value:
              rows.reduce(
                (sum,row) =>
                  sum +
                  serviceCount(row),
                0
              ),

            hint:
              "Available services",
          },

          {
            label:
              "Usage",

            value:
              sumRows(
                rows,
                "usage"
              ),

            hint:
              "Service usage",
          },

          {
            label:
              "Cost",

            value:
              sumRows(
                rows,
                "cost"
              ),

            hint:
              "Customer consumption",
          },

        ]

      : [

          {
            label:
              "Services",

            value:
              rows.length,

            hint:
              "Available services",
          },

          {
            label:
              "Active",

            value:
              rows.filter(
                row =>
                  row.status ===
                  "ACTIVE"
              ).length,

            hint:
              "Active services",
          },

          {
            label:
              "Usage",

            value:
              sumRows(
                rows,
                "usage"
              ),

            hint:
              "Service usage",
          },

          {
            label:
              "Cost",

            value:
              sumRows(
                rows,
                "cost"
              ),

            hint:
              "Customer consumption",
          },

        ];


  const getSubtitle =
    row => {

      if (
        isWallet
      ) {

        return [

          row.display_status ||
          row.status,

          row.currency,

          row.billing_policy,

        ].filter(Boolean);

      }


      if (
        isUsage
      ) {

        return [

          row.status,

          row.capability,

          row.operation,

        ].filter(Boolean);

      }


      if (
        isDomains
      ) {

        return [

          `${serviceCount(row)} services`,

        ];

      }


      if (
        isServiceDetail
      ) {

        return [];

      }


      return [

        row.category,

        row.status,

        serviceStatus(row),

      ].filter(Boolean);

    };


  const listMetrics =
    isWallet

      ? [

          {
            label:
              "Balance",

            value:
              row =>
                row.balance ??
                0,
          },

          {
            label:
              "Reserved",

            value:
              row =>
                row.reserved ??
                0,
          },

          {
            label:
              "Currency",

            value:
              row =>
                row.currency ||
                "-",
          },

          {
            label:
              "Status",

            value:
              row =>
                row.display_status ||
                row.status ||
                "-",
          },

        ]

      : isUsage

      ? [

          {
            label:
              "Service",

            value:
              row =>
                row.name ||
                "-",
          },

          {
            label:
              "Capability",

            value:
              row =>
                row.capability ||
                "-",
          },

          {
            label:
              "Cost",

            value:
              row =>
                row.supplier_cost ??
                row.cost ??
                "-",
          },

          {
            label:
              "Price",

            value:
              row =>
                row.customer_price ??
                row.price ??
                "-",
          },

        ]

      : isDomains

      ? [

          {
            label:
              "Services",

            value:
              row =>
                formatList(
                  serviceNames(row)
                ) ||
                "-",
          },

          {
            label:
              "Usage",

            value:
              row =>
                safeNumber(
                  row.usage
                ),
          },

          {
            label:
              "Cost",

            value:
              row =>
                safeNumber(
                  row.cost
                ),
          },

        ]

      : isServiceDetail

      ? [

          {
            label:
              "Package",

            value:
              row =>
                titleCase(
                  row.package
                ) ||
                "-",
          },

          {
            label:
              "Status",

            value:
              row =>
                row.status ||
                "-",
          },

          {
            label:
              "Usage",

            value:
              row =>
                safeNumber(
                  row.usage
                ),
          },

          {
            label:
              "Cost",

            value:
              row =>
                safeNumber(
                  row.cost
                ),
          },

        ]

      : [

          {
            label:
              "Category",

            value:
              row =>
                row.category ||
                "-",
          },

          {
            label:
              "Status",

            value:
              row =>
                row.status ||
                "-",
          },

          {
            label:
              "Health",

            value:
              row =>
                row.availability ||
                "-",
          },

        ];


  const detailSections =
    isWallet

      ? [

          {
            title:
              "Wallet Information",

            fields:
              selected

                ? [

                    {
                      label:
                        "Wallet ID",

                      value:
                        () =>
                          String(
                            selected.id ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Currency",

                      value:
                        () =>
                          String(
                            selected.currency ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Balance",

                      value:
                        () =>
                          String(
                            selected.balance ??
                            selected.available_balance ??
                            0
                          ),
                    },

                    {
                      label:
                        "Reserved",

                      value:
                        () =>
                          String(
                            selected.reserved ??
                            selected.reserved_balance ??
                            0
                          ),
                    },

                    {
                      label:
                        "Billing Policy",

                      value:
                        () =>
                          String(
                            selected.billing_policy ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Status",

                      value:
                        () =>
                          String(
                            selected.display_status ||
                            selected.status ||
                            "-"
                          ),
                    },

                  ]

                : [],
          },

        ]

      : isDomains

      ? [

          {
            title:
              "Domain Details",

            fields:
              selected

                ? [

                    {
                      label:
                        "Domain",

                      value:
                        () =>
                          String(
                            selected.name ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Description",

                      value:
                        () =>
                          String(
                            selected.description ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Services",

                      value:
                        () =>
                          formatList(
                            serviceNames(
                              selected
                            )
                          ) ||
                          "-",
                    },

                    {
                      label:
                        "Service Count",

                      value:
                        () =>
                          String(
                            serviceCount(
                              selected
                            )
                          ),
                    },

                    {
                      label:
                        "Usage",

                      value:
                        () =>
                          String(
                            safeNumber(
                              selected.usage
                            )
                          ),
                    },

                    {
                      label:
                        "Cost",

                      value:
                        () =>
                          String(
                            safeNumber(
                              selected.cost
                            )
                          ),
                    },

                    {
                      label:
                        "Status",

                      value:
                        () =>
                          String(
                            selected.status ||
                            "AVAILABLE"
                          ),
                    },

                  ]

                : [],
          },

        ]

      : isServiceDetail

      ? [

          {
            title:
              "Service Details",

            fields:
              selected

                ? [

                    {
                      label:
                        "Service",

                      value:
                        () =>
                          String(
                            selected.name ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Description",

                      value:
                        () =>
                          String(
                            selected.description ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Package",

                      value:
                        () =>
                          String(
                            titleCase(
                              selected.package
                            ) ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Status",

                      value:
                        () =>
                          String(
                            selected.status ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Availability",

                      value:
                        () =>
                          serviceStatus(
                            selected
                          ),
                    },

                    {
                      label:
                        "Usage",

                      value:
                        () =>
                          String(
                            safeNumber(
                              selected.usage
                            )
                          ),
                    },

                    {
                      label:
                        "Cost",

                      value:
                        () =>
                          String(
                            safeNumber(
                              selected.cost
                            )
                          ),
                    },

                  ]

                : [],
          },

        ]

      : isUsage

      ? [

          {
            title:
              "Usage Details",

            fields:
              selected

                ? [

                    {
                      label:
                        "Service",

                      value:
                        () =>
                          String(
                            selected.name ||
                            selected.service_id ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Capability",

                      value:
                        () =>
                          String(
                            selected.capability ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Quantity",

                      value:
                        () =>
                          String(
                            safeNumber(
                              selected.quantity
                            )
                          ),
                    },

                    {
                      label:
                        "Cost",

                      value:
                        () =>
                          String(
                            safeNumber(
                              selected.customer_price ??
                              selected.cost
                            )
                          ),
                    },

                    {
                      label:
                        "Status",

                      value:
                        () =>
                          String(
                            selected.status ||
                            "-"
                          ),
                    },

                  ]

                : [],
          },

        ]

      : [

          {
            title:
              "Service Details",

            fields:
              selected

                ? [

                    {
                      label:
                        "Service",

                      value:
                        () =>
                          String(
                            selected.name ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Category",

                      value:
                        () =>
                          String(
                            selected.category ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Status",

                      value:
                        () =>
                          String(
                            selected.status ||
                            "-"
                          ),
                    },

                    {
                      label:
                        "Health",

                      value:
                        () =>
                          String(
                            selected.availability ||
                            "-"
                          ),
                    },

                  ]

                : [],
          },

        ];


  if (
    !capability
  ) {

    return (

      <div className="rounded-[32px] border border-red-400/30 bg-red-500/10 p-6 text-red-100">

        Missing service capability

      </div>

    );

  }


  return (

    <MasterDataWorkCenter

      organizationId={
        organizationId
      }

      entityId={
        entityId
      }

      country={
        country
      }

      currency={
        contextCurrency ||
        selected?.currency ||
        null
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

        isDomains

          ? row => {

              router.push(
                `/workspace/${organizationId}/services/connected-services/${row.id}`
              );

            }

          : isServiceDetail

          ? row => {

              setSelectedId(
                row.id
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
          row.capability ||
          row.operation ||
          capability.name
      }

      getSubtitle={
        getSubtitle
      }

      getInitials={
        row =>
          String(
            row.name ||
            row.capability ||
            capability.name
          )
          .slice(0,2)
          .toUpperCase()
      }

      listMetrics={
        listMetrics
      }

      detailSections={
        detailSections
      }

    />

  );

}
