export function resolveCreativeCommands({
  commands = [],
  runtime,
  editor,
}) {

  return commands.map(command => {

    let onClick = null;

    if (command.id === "create_mission") {

      onClick = async () => {

        const title =
          window.prompt(
            "Mission objective"
          );

        if (!title) return;

        const response =
          await fetch(
            "/api/creative/missions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                organization_id:
                  runtime.organizationId,

                business_goal:
                  title,

                objective:
                  title,

              }),
            }
          );

        const result =
          await response.json();

        if (!response.ok) {
          throw new Error(
            result.error ||
            "Mission creation failed"
          );
        }

        console.log(
          "MISSION CREATED",
          result
        );

        runtime.refresh?.();

      };

    }


    if (command.id === "start_mission") {

      onClick = async () => {

        const mission =
          runtime.missionRuntime?.current;

        if (!mission) return;

        const response =
          await fetch(
            "/api/creative/missions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({

                organization_id:
                  runtime.organizationId,

                id:
                  mission.id,

                action:
                  "start",

              }),
            }
          );

        if (!response.ok) {
          throw new Error(
            "Mission start failed"
          );
        }

        editor.setActiveWorkspace(
          "brief"
        );

        runtime.refresh?.();

      };

    }


    if (command.id === "open_assets") {

      onClick = () => {

        editor.setActiveWorkspace(
          "assets"
        );

      };

    }


    return {
      ...command,
      onClick,
    };

  });

}
