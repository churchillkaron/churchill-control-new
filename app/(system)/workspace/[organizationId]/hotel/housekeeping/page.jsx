"use client";

import { useState, useEffect } from "react";

export default function HousekeepingPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  async function fetchTasks() {
    try {
      const res = await fetch("/api/hotel/housekeeping/list");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(taskId, status) {
    try {
      await fetch("/api/hotel/housekeeping/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status }),
      });
      fetchTasks();
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchTasks();
  }, []);

  if (loading) return <div>Loading housekeeping tasks...</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Housekeeping</h1>
      {tasks.length === 0 ? (
        <div>No tasks assigned</div>
      ) : (
        <ul className="space-y-4">
          {tasks.map((t) => (
            <li key={t.id} className="border rounded-xl p-4">
              <div>Room: {t.hotel_rooms?.room_number} - {t.hotel_rooms?.room_type}</div>
              <div>Task: {t.task_type}</div>
              <div>Status: {t.status}</div>
              <div className="flex gap-2 mt-2">
                {t.status === "PENDING" && (
                  <button onClick={() => updateStatus(t.id, "IN_PROGRESS")}>Start</button>
                )}
                {t.status === "IN_PROGRESS" && (
                  <button onClick={() => updateStatus(t.id, "COMPLETED")}>Complete</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
