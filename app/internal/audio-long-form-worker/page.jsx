"use client";
import {useEffect,useState} from "react";
import {renderMusicMultitrackOffline} from "@/lib/creative/music/client/MusicOfflineMixRenderRuntime";
import {renderMusicSurroundPremasterOffline} from "@/lib/creative/music/client/MusicOfflineSurroundRenderRuntime";

export default function AudioLongFormWorkerPage(){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
   window.__AVANTIQO_LONG_FORM_RENDER_CHUNK__=async(payload={})=>{
     const {session,asset_urls={},chunk,callback_url,callback_token,job_id,job_hash}=payload;
     if(!session||!chunk||!callback_url)throw new Error("LONG_FORM_BROWSER_CHUNK_PAYLOAD_INVALID");
     const renderWindow={start_seconds:chunk.render_start_seconds,end_seconds:chunk.render_end_seconds};
     const expectedDurationSeconds=Math.max(0,renderWindow.end_seconds-renderWindow.start_seconds);
     const rendered=session.spatial_audio?.surround_enabled===true
       ? await renderMusicSurroundPremasterOffline({session,assetUrls:asset_urls,expectedDurationSeconds,renderWindow})
       : await renderMusicMultitrackOffline({session,assetUrls:asset_urls,expectedDurationSeconds,renderWindow});
     const response=await fetch(callback_url,{method:"POST",headers:{"Content-Type":"audio/wav","Authorization":`Bearer ${callback_token}`,"X-Avantiqo-Job-Id":job_id,"X-Avantiqo-Job-Hash":job_hash,"X-Avantiqo-Chunk-Index":String(chunk.index),"X-Avantiqo-Render-Start-Frame":String(chunk.render_start_frame),"X-Avantiqo-Render-End-Frame":String(chunk.render_end_frame)},body:rendered.blob});
     const body=await response.json();if(!response.ok||body.success===false)throw new Error(body.error||"LONG_FORM_BROWSER_CHUNK_UPLOAD_FAILED");
     return{success:true,contract:"AVANTIQO_LONG_FORM_BROWSER_RENDER_CHUNK_V1",chunk_index:chunk.index,render_window:renderWindow,render_contract:rendered.contract,sample_rate:rendered.sample_rate,channels:rendered.channels,bit_depth:rendered.bit_depth,callback:body};
   };
   setReady(true);
   return()=>{delete window.__AVANTIQO_LONG_FORM_RENDER_CHUNK__;};
 },[]);
 return <main style={{fontFamily:"monospace",padding:24,background:"#050505",color:"#d6a66a",minHeight:"100vh"}}><h1 style={{fontSize:14}}>Avantiqo Professional Audio Long-Form Worker</h1><p id="worker-ready" data-ready={ready?"true":"false"} style={{fontSize:11,opacity:.7}}>{ready?"WORKSTATION GRAPH READY":"INITIALIZING"}</p></main>;
}
