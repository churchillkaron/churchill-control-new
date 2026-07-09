"use client";

import { useCreativeEditor } from "./hooks/useCreativeEditor";

import CreativeWorkspaceLayout from "./layout/CreativeWorkspaceLayout";
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
    refresh: editor.refresh,
    refreshing: editor.refreshing,
  };

  return (
    <CreativeWorkspaceLayout
      header={
        <Header
          runtime={liveRuntime}
          editor={editor}
        />
      }
      sidebar={
        <Sidebar
          runtime={liveRuntime}
          editor={editor}
        />
      }
      canvas={
        <Canvas
          runtime={liveRuntime}
          editor={editor}
        />
      }
      inspector={
        <Inspector
          runtime={liveRuntime}
          editor={editor}
        />
      }
      dock={
        <BottomDock
          runtime={liveRuntime}
          editor={editor}
        />
      }
    />
  );
}
