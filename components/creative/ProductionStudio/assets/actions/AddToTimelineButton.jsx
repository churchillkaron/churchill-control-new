"use client";

import { useState } from "react";

export default function AddToTimelineButton({

  asset,

  addToTimeline,

}) {

  const [loading,setLoading] =
    useState(false);

  async function run(){

    if(loading)
      return;

    setLoading(true);

    try{

      await addToTimeline(
        asset
      );

    }finally{

      setLoading(false);

    }

  }

  return(

    <button

      onClick={run}

      disabled={loading}

      className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 transition hover:bg-cyan-500/20 disabled:opacity-50"

    >

      {

        loading

          ? "Adding..."

          : "Add to Timeline"

      }

    </button>

  );

}
