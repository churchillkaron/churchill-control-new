"use client";

import { useRouter } from "next/navigation";

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json();
}

function Action({
  children,
  onClick,
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 transition hover:bg-white/[0.08]"
    >
      {children}
    </button>
  );
}

export default function CreateButtons({
  runtime,
}) {

  const router = useRouter();

  const project =
    runtime.projectRuntime?.current;

  const scenes =
    runtime.sceneRuntime?.items || [];

  const shots =
    runtime.shotRuntime?.items || [];

  const selected =
    runtime.editor?.selection || null;

  function currentScene() {

    if (selected?.type === "scene")
      return selected.data;

    if (selected?.type === "shot")
      return scenes.find(
        s => s.id === selected.data.scene_id
      );

    return scenes.at(-1);

  }

  function currentShot() {

    if (selected?.type === "shot")
      return selected.data;

    const scene = currentScene();

    if (!scene) return null;

    const list =
      shots.filter(
        s => s.scene_id === scene.id
      );

    return list.at(-1) || null;

  }

  async function createScene() {

    await post(
      "/api/creative/scenes",
      {

        organization_id:
          runtime.organizationId,

        creative_mission_id:
          runtime.missionRuntime?.current?.id || null,

        creative_project_id:
          project.id,

        scene_number:
          scenes.length + 1,

        title:
          `Scene ${scenes.length + 1}`,

      }
    );

    router.refresh();

  }

  async function createShot() {

    const scene =
      currentScene();

    if (!scene) return;

    const list =
      shots.filter(
        s => s.scene_id === scene.id
      );

    await post(
      "/api/creative/shots",
      {

        organization_id:
          runtime.organizationId,

        creative_mission_id:
          runtime.missionRuntime?.current?.id || null,

        creative_project_id:
          project.id,

        scene_id:
          scene.id,

        scene_number:
          scene.scene_number,

        shot_number:
          list.length + 1,

        title:
          `Shot ${list.length + 1}`,

      }
    );

    router.refresh();

  }

  async function createTask() {

    const shot =
      currentShot();

    if (!shot) return;

    await post(
      "/api/creative/production/tasks",
      {

        organization_id:
          runtime.organizationId,

        creative_mission_id:
          runtime.missionRuntime?.current?.id || null,

        creative_project_id:
          project.id,

        scene_id:
          shot.scene_id,

        shot_id:
          shot.id,

        type:
          "IMAGE",

        title:
          "New Production Task",

      }
    );

    router.refresh();

  }

  async function createAsset() {

    const shot =
      currentShot();

    if (!shot) return;

    const task =
      await post(
        "/api/creative/production/tasks",
        {

          organization_id:
            runtime.organizationId,

          creative_project_id:
            project.id,

          scene_id:
            shot.scene_id,

          shot_id:
            shot.id,

          type:
            "GENERATE_IMAGE",

          title:
            "Generate Image",

        }
      );

    await post(
      "/api/creative/assets/graph",
      {

        organization_id:
          runtime.organizationId,

        creative_mission_id:
          runtime.missionRuntime?.current?.id || null,

        creative_project_id:
          project.id,

        production_task_id:
          task.task.id,

        type:
          "IMAGE",

        metadata: {

          shot_id:
            shot.id,

        },

      }
    );

    router.refresh();

  }

  return (

    <>

      <Action
        onClick={createScene}
      >
        + Scene
      </Action>

      <Action
        onClick={createShot}
      >
        + Shot
      </Action>

      <Action
        onClick={createTask}
      >
        + Task
      </Action>

      <Action
        onClick={createAsset}
      >
        + Asset
      </Action>

    </>

  );

}
