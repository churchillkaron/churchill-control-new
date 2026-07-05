"use client";

import { useCreativeEditor } from "./hooks/useCreativeEditor";

import Header from "./layout/Header";
import Sidebar from "./layout/Sidebar";
import Canvas from "./layout/Canvas";
import Inspector from "./layout/Inspector";
import BottomDock from "./layout/BottomDock";

export default function ProductionStudio({
  runtime,
}) {

  const editor =
    useCreativeEditor(runtime);

  const liveRuntime = {
    ...runtime,
    refresh:
      editor.refresh,
    refreshing:
      editor.refreshing,
  };

  return (

    <main className="min-h-screen bg-[#05070d] text-white">

      <Header
        runtime={liveRuntime}
        editor={editor}
      />

      <div
        className="
          grid
          h-[calc(100vh-360px)]
          grid-cols-[320px_minmax(0,1fr)_380px]
        "
      >

        <Sidebar
          runtime={liveRuntime}
          editor={editor}
        />

        <Canvas
          runtime={liveRuntime}
          editor={editor}
        />

        <Inspector
          runtime={liveRuntime}
          editor={editor}
        />

      </div>

      <BottomDock
        runtime={liveRuntime}
        editor={editor}
      />

    </main>

  );

}
