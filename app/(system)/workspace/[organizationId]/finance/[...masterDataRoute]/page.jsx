"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useFinanceRuntime } from "@/lib/finance/runtime/useFinanceRuntime";
import { useParams, notFound } from "next/navigation";

import MasterDataWorkCenter,{
  formatMoney,
  initials,
} from "@/components/workspace/master-data/MasterDataWorkCenter";

import {
  getWorkspaceItemByWorkspace,
} from "@/lib/platform/registry/erpRegistry";

export default function FinanceMasterDataRouter(){

  const params=useParams();

  const {
    organizationId,
    financeGet,
    loading: runtimeLoading,
  } = useFinanceRuntime();

  const route=params.masterDataRoute||[];

  const moduleKey =
    String(route[0] || "")
      .replace(/_/g,"-")
      .replace(/^entities$/,"legal-entities")
      .replace(/^bank_accounts$/,"bank-accounts")
      .replace(/^cost_centers$/,"cost-centers");

  const capability =
    getWorkspaceItemByWorkspace(
      "finance",
      moduleKey
    );

  const config =
    capability?.ui;

  if(!capability){
    notFound();
  }

  const [loading,setLoading]=useState(true);
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [selectedId,setSelectedId]=useState(null);
  const [menuId,setMenuId]=useState(null);
  const [refresh,setRefresh]=useState(0);

  useEffect(()=>{

    let active=true;

    async function load(){

      try{

        setLoading(true);
        setError("");

        const json =
          await financeGet(
            config?.api
          );

        if(!active){
          return;
        }

        if(!json.success){

          throw new Error(
            json.error||
            "Load failed"
          );

        }

        setRows(

          json[
            config?.rowsKey
          ]||

          json.rows||

          []

        );

      }catch(e){

        if(active){

          setError(
            e.message
          );

        }

      }finally{

        if(active){

          setLoading(false);

        }

      }

    }

    if(
      !runtimeLoading &&
      organizationId
    ){

      load();

    }

    return()=>{

      active=false;

    };

  },[
    organizationId,
    moduleKey,
    refresh,
    runtimeLoading,
  ]);

  const filteredRows=
    useMemo(()=>{

      const q=
        query
          .trim()
          .toLowerCase();

      if(!q){
        return rows;
      }

      return rows.filter(
        row=>

          (config?.search||[])
            .map(
              key=>row[key]
            )
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)

      );

    },[
      rows,
      query,
      config,
    ]);


  const selected=

    filteredRows.find(
      row=>row.id===selectedId
    )||

    filteredRows[0]||

    null;

  const totalValue=
    rows.reduce(

      (sum,row)=>

        sum+

        Number(

          row.current_balance||

          row.balance||

          row.open_balance||

          row.budget_amount||

          row.total_amount||

          row.total_spent||

          row.share_capital||

          0

        ),

      0

    );

  return(

    <MasterDataWorkCenter

      workspaceId="finance"
      moduleKey={moduleKey}

      organizationId={organizationId}

      onRefresh={()=>

        setRefresh(
          value=>value+1
        )

      }

      eyebrow="Finance / Master Data"

      title={capability?.name}

      description={capability?.description}

      primaryActionLabel={
        config?.primaryActionLabel
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

      searchPlaceholder={`Search ${capability?.name.toLowerCase()}...`}

      getName={
        config?.name ||
        (row =>
          row.customer_name ||
          row.vendor_name ||
          row.account_name ||
          row.name ||
          "Unnamed")
      }

      getInitials={

        row=>

          initials(

            (
              config?.name
                ? config.name(row)
                : row.customer_name ||
                  row.vendor_name ||
                  row.account_name ||
                  row.name ||
                  "Unnamed"
            )

          )

      }

      getSubtitle={
        config?.subtitle ||
        (() => [])
      }

      kpis={[

        {

          label:capability?.name,

          value:rows.length,

          hint:"Records",

        },

        {

          label:"Active",

          value:

            rows.filter(

              row=>

                row.active!==false &&

                row.status!=="INACTIVE"

            ).length,

          hint:"Operational",

        },

        {

          label:"Tracked",

          value:

            `${formatMoney(totalValue)} THB`,

          hint:"Financial",

        },

        {

          label:"Currencies",

          value:

            new Set(

              rows

                .map(

                  row=>

                    row.currency_code||

                    row.currency

                )

                .filter(Boolean)

            ).size,

          hint:"Coverage",

        },

      ]}

      listMetrics={[

        {

          label:"Code",

          value:row=>

            row.code||

            row.account_number||

            row.vendor_code||

            "-",

        },

        {

          label:"Type",

          value:row=>

            row.category||

            row.department||

            row.bank_name||

            row.country||

            "-",

        },

        {

          label:"Status",

          value:row=>

            row.status||

            (row.active===false

              ?"INACTIVE"

              :"ACTIVE"),

        },

      ]}


      quickActions={
        capability.quickActions ||
        capability.actions ||
        []
      }

      menuActions={
        capability.actions ||
        []
      }

      detailSections={[

        {

          title:"Overview",

          fields:[

            {

              label:"Name",

              value:row=>

                (
              config?.name
                ? config.name(row)
                : row.customer_name ||
                  row.vendor_name ||
                  row.account_name ||
                  row.name ||
                  "Unnamed"
            ),

            },

            {

              label:"Code",

              value:row=>

                row.code||

                row.vendor_code||

                row.account_number||

                "-",

            },

            {

              label:"Status",

              value:row=>

                row.status||

                (row.active===false

                  ?"INACTIVE"

                  :"ACTIVE"),

            },

            {

              label:"Currency",

              value:row=>

                row.currency_code||

                row.currency||

                "-",

            },

          ],

        },

        {

          title:"Contact",

          fields:[

            {

              label:"Email",

              value:row=>

                row.email||

                row.customer_email||

                row.vendor_email||

                "-",

            },

            {

              label:"Phone",

              value:row=>

                row.phone||

                row.customer_phone||

                row.vendor_phone||

                "-",

            },

            {

              label:"Country",

              value:row=>

                row.country||

                "-",

            },

            {

              label:"Tax",

              value:row=>

                row.tax_number||

                row.tax_id||

                "-",

            },

          ],

        },

        {

          title:"Financial",

          fields:[

            {

              label:"Balance",

              value:row=>

                formatMoney(

                  row.current_balance||

                  row.balance||

                  row.open_balance||

                  row.total_amount||

                  row.budget_amount||

                  0

                ),

            },

            {

              label:"Bank",

              value:row=>

                row.bank_name||

                "-",

            },

            {

              label:"Account",

              value:row=>

                row.account_number||

                "-",

            },

            {

              label:"Department",

              value:row=>

                row.department||

                "-",

            },

          ],

        },

      ]}

    />

  );

}

