"use client";

import { useEffect, useState } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export default function MaintenancePage() {
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = organization?.id || "";

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchTasks() {
    if (!organizationId) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(
        `/api/hotel/maintenance/list?organizationId=${encodeURIComponent(organizationId)}`,
      );
      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Unable to load maintenance tasks");
      }

      setTasks(data.tasks || []);
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError.message || "Unable to load maintenance tasks");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(taskId, status) {
    try {
      setError("");

      const response = await fetch("/api/hotel/maintenance/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Unable to update maintenance task");
      }

      await fetchTasks();
    } catch (updateError) {
      console.error(updateError);
      setError(updateError.message || "Unable to update maintenance task");
    }
  }

  useEffect(() => {
    if (organizationId) fetchTasks();
  }, [organizationId]);

  if (organizationLoading || loading) {
    return <div className="p-8">Loading maintenance...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Maintenance</h1>

      {error ? <div className="mb-4">{error}</div> : null}

      {tasks.length === 0 ? (
        <div>No maintenance tasks</div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div key={task.id} className="border rounded-xl p-4">
              <div>
                Property: {task.hotel_properties?.name || task.property_id || "-"}
              </div>
              <div>Type: {task.task_type || "-"}</div>
              <div>Status: {task.status || "-"}</div>
              {task.notes ? <div>Notes: {task.notes}</div> : null}

              <div className="flex gap-2 mt-4">
                {task.status === "PENDING" ? (
                  <button onClick={() => updateStatus(task.id, "IN_PROGRESS")}>
                    Start
                  </button>
                ) : null}

                {task.status === "IN_PROGRESS" ? (
                  <button onClick={() => updateStatus(task.id, "COMPLETED")}>
                    Complete
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
