"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import MasterDataWorkCenter from "@/components/workspace/master-data/MasterDataWorkCenter";


export default function ChannelConnectionWorkCenter({

  organizationId,

  capability,

}) {


  const searchParams =
    useSearchParams();


  const connectionStatus =
    searchParams.get("status");


  const [rows,setRows] =
    useState([]);


  const [loading,setLoading] =
    useState(true);


  const category =
    capability?.category ||
    null;



  useEffect(()=>{

    async function load(){

      const res =
        await fetch(
          `/api/platform/channels?organization_id=${organizationId}`
        );


      const json =
        await res.json();


      if(json.success){

        setRows(
          (json.rows || [])
            .filter(
              row =>
                !category ||
                row.category === category
            )
        );

      }


      setLoading(false);

    }


    if(organizationId){
      load();
    }


  },[
    organizationId,
    category
  ]);



  return (

    <>

    {
      connectionStatus && (

        <div
          className="
            mb-4
            rounded-2xl
            border
            border-white/10
            bg-white/5
            px-4
            py-3
            text-sm
            text-white/80
          "
        >
          {
            connectionStatus === "connected"
              ? "Channel connected successfully."
              : "Channel connection failed."
          }
        </div>

      )
    }


    <MasterDataWorkCenter

      rows={
        rows
      }

      loading={
        loading
      }

      capability={
        capability
      }


      menuActions={
        row =>
          row.actions || []
      }


      title="Business Connections"

      description="Manage customer-owned external business accounts and channels."

      getName={
        row =>
          row.name
      }

      getSubtitle={
        row =>
          row.category
      }

      searchPlaceholder="Search channels..."

      listMetrics={[

        {
          label:"Status",
          value:
            row =>
              row.status || "-"
        },

        {
          label:"Connected",
          value:
            row =>
              row.connected
                ? "YES"
                : "NO"
        },

      ]}

    />

    </>

  );

}
