"use client";

import { useEffect, useState } from "react";

import {
  getDocumentRenderer,
} from "@/lib/platform/documents/client/DocumentRendererRegistry";


import DocumentHeader from "@/components/workspace/documents/DocumentHeader";


export default function PreviewEngine({

  action,

  payload = {},

  documentType = "CustomerInvoice",

  organizationId,

  entityId,

  onConfirm,

  onClose,

}) {


  const [data,setData] =
    useState(payload);


  console.log(
    "DOCUMENT PREVIEW PAYLOAD",
    {
      documentType,
      payload,
    }
  );


  const [renderedDocument,setRenderedDocument] =
    useState(null);

  const [renderedBrand,setRenderedBrand] =
    useState(null);

  const [renderedData,setRenderedData] =
    useState(null);


  const [loading,setLoading] =
    useState(false);


  useEffect(()=>{

    setData(payload);

  },[payload]);


  useEffect(()=>{

    async function loadDocument(){

      setLoading(true);


      try {

        const res =
          await fetch(
            "/api/documents/preview",
            {

              method:"POST",

              headers:{
                "Content-Type":"application/json",
              },

              body:JSON.stringify({

                documentType,

                data,

                organizationId,

                entityId,

              }),

            }
          );


        const json =
          await res.json();


        if(!json.success){

          throw new Error(
            json.error ||
            "Preview failed"
          );

        }


        const Renderer =
          getDocumentRenderer(
            json.rendered.documentType
          );


        if (!Renderer) {

          throw new Error(
            "Document renderer not found"
          );

        }


        setRenderedBrand(
          json.rendered.brand
        );

        setRenderedData(
          json.rendered.data
        );


        setRenderedDocument(

          <Renderer
            data={json.rendered.data}
            template={json.rendered.template}
            brand={json.rendered.brand}
          />

        );


      } catch(error){

        console.error(
          "PREVIEW ERROR",
          error
        );


        setRenderedDocument(

          <div className="text-red-300">

            {error.message}

          </div>

        );


      } finally {

        setLoading(false);

      }

    }


    loadDocument();

  },[
    data,
    documentType,
    organizationId,
    entityId,
  ]);


  return (

    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur">

      <div className="w-full max-w-5xl rounded-3xl bg-[#090909] border border-white/10 p-8">


        <div className="text-xs uppercase tracking-[0.3em] text-amber-300/70">

          Preview

        </div>


        <h2 className="mt-3 text-3xl font-light text-white">

          {action?.title || "Document Preview"}

        </h2>


        <div className="mt-8 max-h-[70vh] overflow-auto">

          {loading ? (

            <div className="text-white/50">
              Rendering document...
            </div>

          ) : (

            <div className="rounded-3xl bg-white p-10 text-black">

              {renderedDocument}

            </div>

          )}

        </div>


        <div className="mt-8 flex justify-end gap-3">


          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-3 text-white/60"
          >

            Back

          </button>


          {onConfirm ? (

            <button
              onClick={onConfirm}
              className="rounded-xl bg-amber-400 px-5 py-3 text-black"
            >

              Confirm

            </button>

          ) : null}


        </div>


      </div>

    </div>

  );

}
