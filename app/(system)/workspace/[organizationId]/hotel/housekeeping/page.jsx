"use client";

import { useEffect, useState } from "react";
import { useOrganizationRuntime } from "@/lib/hooks/useOrganizationRuntime";

export default function HousekeepingPage() {
  const { organization, loading: organizationLoading } = useOrganizationRuntime();
  const organizationId = organization?.id || "";

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchTasks() {
    if (!organizationId) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/hotel/housekeeping/list?organizationId=${organizationId}`,
      );
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to load housekeeping tasks");
      }

      setTasks(data.tasks || []);
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.message || "Unable to load housekeeping tasks");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(taskId, status) {
    try {
      const res = await fetch("/api/hotel/housekeeping/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to update housekeeping task");
      }

      await fetchTasks();
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.message || "Unable to update housekeeping task");
    }
  }

  useEffect(() => {
    if (organizationId) fetchTasks();
  }, [organizationId]);

  if (organizationLoading || loading) {
    return <div className="p-8">Loading housekeeping tasks...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Housekeeping</h1>

      {error ? <div className="mb-4 text-red-600">{error}</div> : null}

      {tasks.length === 0 ? (
        <div>No tasks assigned</div>
      ) : (
        <ul className="space-y-4">
          {tasks.map((task) => (
            <li key={task.id} className="border rounded-xl p-4">
              <div>
                Room: {task.hotel_rooms?.room_number || "Unassigned"}
                {task.hotel_rooms?.room_type ? ` - ${task.hotel_rooms.room_type}` : ""}
              </div>
              <div>Priority: {task.priority || "NORMAL"}</div>
              <div>Status: {task.task_status}</div>
              {task.notes ? <div>Notes: {task.notes}</div> : null}
              {task.task_date ? <div>Task Date: {task.task_date}</div> : null}

              <div className="flex gap-2 mt-2">
                {task.task_status === "PENDING" && (
                  <button onClick={() => updateStatus(task.id, "IN_PROGRESS")}>Start</button>
                )}
                {task.task_status === "IN_PROGRESS" && (
                  <button onClick={() => updateStatus(task.id, "COMPLETED")}>Complete</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
