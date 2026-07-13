"use client";

import { useEffect, useMemo, useState } from "react";

function titleFromAction(action) {
  return (
    action?.title ||
    action?.label ||
    action?.name ||
    "Assign Task"
  );
}

function normalizeUsers(payload) {
  const users =
    Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.users)
        ? payload.users
        : [];

  return users.filter(user => user?.staff_id);
}

function userLabel(user) {
  const name =
    user.name ||
    user.display_name ||
    user.staff_id;

  const role =
    user.role ||
    user.department ||
    "Staff";

  return `${name} - ${String(role).toUpperCase()}`;
}

export default function AssignEngine({
  action,
  row,
  organizationId,
  workspaceId,
  moduleKey,
  onClose,
  onComplete,
}) {
  const [users, setUsers] =
    useState([]);

  const [selected, setSelected] =
    useState(row?.assigned_to || "");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const assignableEndpoint =
    action?.assignableEndpoint ||
    "/api/platform/users/assignable";

  const assignEndpoint =
    action?.endpoint ||
    "/api/inventory/warehouse/tasks/assign";

  const title =
    titleFromAction(action);

  const selectedUser =
    useMemo(
      () =>
        users.find(user => user.staff_id === selected) ||
        null,
      [
        users,
        selected,
      ]
    );

  useEffect(() => {
    let active =
      true;

    async function load() {
      if (!organizationId) {
        setError("organizationId is required");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const url =
          new URL(
            assignableEndpoint,
            window.location.origin
          );

        url.searchParams.set(
          "organizationId",
          organizationId
        );

        const response =
          await fetch(
            url.toString(),
            {
              credentials: "include",
            }
          );

        const payload =
          await response.json()
            .catch(() => ([]));

        if (!response.ok || payload?.success === false) {
          throw new Error(
            payload?.error ||
            payload?.message ||
            "Could not load assignable users"
          );
        }

        if (!active) {
          return;
        }

        setUsers(
          normalizeUsers(payload)
        );
      } catch (err) {
        if (active) {
          setError(
            err.message ||
            "Could not load assignable users"
          );
          setUsers([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [
    assignableEndpoint,
    organizationId,
  ]);

  async function assign() {
    if (!selected) {
      setError("Choose a staff member");
      return;
    }

    if (!row?.id) {
      setError("Selected row is missing an id");
      return;
    }

    if (!organizationId) {
      setError("organizationId is required");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response =
        await fetch(
          assignEndpoint,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              organization_id:
                organizationId,
              task_id:
                row.id,
              assigned_to:
                selected,
            }),
          }
        );

      const result =
        await response.json()
          .catch(() => ({}));

      if (!response.ok || result?.success === false) {
        throw new Error(
          result?.error ||
          result?.message ||
          "Assignment failed"
        );
      }

      onComplete?.(result);
      onClose?.();
    } catch (err) {
      setError(
        err.message ||
        "Assignment failed"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-[28px] border border-white/10 bg-[#0a0a0a] p-6 text-white shadow-2xl shadow-black">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-amber-300/70">
              Assign
            </div>

            <h2 className="mt-3 text-2xl font-light tracking-[-0.04em]">
              {title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/55 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <label className="mt-6 block text-sm text-white/60">
          Assign to:
        </label>

        {loading ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/50">
            Loading users...
          </div>
        ) : (
          <select
            value={selected}
            onChange={event =>
              setSelected(event.target.value)
            }
            className="mt-3 w-full rounded-xl border border-white/10 bg-black p-3 text-white outline-none"
          >
            <option value="">
              Select person
            </option>

            {users.map(user => (
              <option
                key={user.staff_id}
                value={user.staff_id}
              >
                {userLabel(user)}
              </option>
            ))}
          </select>
        )}

        {selectedUser ? (
          <div className="mt-3 text-sm text-white/45">
            {selectedUser.department || workspaceId || moduleKey || ""}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 px-5 py-3 text-sm text-white/60 hover:bg-white/5"
          >
            Back
          </button>

          <button
            type="button"
            onClick={assign}
            disabled={
              saving ||
              loading ||
              !selected
            }
            className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-semibold text-black disabled:opacity-40"
          >
            {saving
              ? "Assigning..."
              : "Assign"}
          </button>
        </div>
      </div>
    </div>
  );
}
