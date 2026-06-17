"use client";

import { useState, useEffect } from "react";

export default function MaintenancePage() {

  const [tasks, setTasks] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  async function fetchTasks() {

    try {

      const res =
        await fetch(
          "/api/hotel/maintenance/list"
        );

      const data =
        await res.json();

      setTasks(
        data.tasks || []
      );

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  }

  async function updateStatus(
    taskId,
    status
  ) {

    try {

      await fetch(
        "/api/hotel/maintenance/update",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            taskId,
            status,
          }),
        }
      );

      fetchTasks();

    } catch (error) {

      console.error(error);

    }

  }

  useEffect(() => {

    fetchTasks();

  }, []);

  if (loading) {

    return (
      <div>
        Loading maintenance...
      </div>
    );

  }

  return (

    <div className="p-8">

      <h1 className="text-3xl font-bold mb-8">
        Maintenance
      </h1>

      {tasks.length === 0 ? (

        <div>
          No maintenance tasks
        </div>

      ) : (

        <div className="space-y-4">

          {tasks.map((task) => (

            <div
              key={task.id}
              className="border rounded-xl p-4"
            >

              <div>
                Property:
                {" "}
                {task.property_id}
              </div>

              <div>
                Type:
                {" "}
                {task.task_type}
              </div>

              <div>
                Status:
                {" "}
                {task.status}
              </div>

              <div className="flex gap-2 mt-4">

                {task.status ===
                  "PENDING" && (

                  <button
                    onClick={() =>
                      updateStatus(
                        task.id,
                        "IN_PROGRESS"
                      )
                    }
                  >
                    Start
                  </button>

                )}

                {task.status ===
                  "IN_PROGRESS" && (

                  <button
                    onClick={() =>
                      updateStatus(
                        task.id,
                        "COMPLETED"
                      )
                    }
                  >
                    Complete
                  </button>

                )}

              </div>

            </div>

          ))}

        </div>

      )}

    </div>

  );

}
