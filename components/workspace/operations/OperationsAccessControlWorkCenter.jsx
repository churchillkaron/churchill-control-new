"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import { useBusinessContext } from "@/app/providers/BusinessContextProvider";
import useOperationsAccess from "@/lib/operations/security/useOperationsAccess";

function userLabel(user) {
  return [user?.name || user?.email || user?.user_id, user?.position, user?.department]
    .filter(Boolean)
    .join(" · ");
}

export default function OperationsAccessControlWorkCenter() {
  const businessContext = useBusinessContext() || {};
  const organizationId = businessContext.organization_id || businessContext.organization?.id || null;
  const entityId = businessContext.entity_id || businessContext.entity?.id || null;
  const periodId = businessContext.period_id || businessContext.period?.id || null;
  const access = useOperationsAccess({ organizationId, entityId, periodId });

  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleCode, setSelectedRoleCode] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!organizationId || !access.can?.administer) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ organization_id: organizationId });
      if (entityId) params.set("entity_id", entityId);
      if (periodId) params.set("period_id", periodId);

      const response = await fetch(`/api/operations/security/roles?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations roles could not be loaded.");
      }

      const nextRoles = Array.isArray(json.roles) ? json.roles : [];
      const nextUsers = Array.isArray(json.users) ? json.users : [];
      setRoles(nextRoles);
      setUsers(nextUsers);
      setAssignments(Array.isArray(json.assignments) ? json.assignments : []);
      setSelectedUserId((current) => current || nextUsers[0]?.user_id || "");
      setSelectedRoleCode((current) => current || nextRoles[0]?.role_code || "");
    } catch (loadError) {
      setError(loadError.message || "Operations roles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, entityId, periodId, access.can?.administer]);

  useEffect(() => {
    load();
  }, [load]);

  const roleById = useMemo(
    () => new Map(roles.map((role) => [String(role.id), role])),
    [roles],
  );
  const userById = useMemo(
    () => new Map(users.map((user) => [String(user.user_id), user])),
    [users],
  );

  const filteredAssignments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return assignments;

    return assignments.filter((assignment) => {
      const role = assignment.operations_role || roleById.get(String(assignment.role_id));
      const user = userById.get(String(assignment.user_id));
      return [
        user?.name,
        user?.email,
        user?.position,
        user?.department,
        role?.role_code,
        role?.role_name,
      ].filter(Boolean).join(" ").toLowerCase().includes(normalized);
    });
  }, [assignments, query, roleById, userById]);

  async function changeRole(method, payload) {
    if (!organizationId) return;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/operations/security/roles", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          entity_id: entityId || null,
          period_id: periodId || null,
          ...payload,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json.ok) {
        throw new Error(json.error || "Operations role change failed.");
      }

      setNotice(method === "POST" ? "Operations role assigned." : "Operations role revoked.");
      await Promise.all([load(), access.refresh()]);
    } catch (changeError) {
      setError(changeError.message || "Operations role change failed.");
    } finally {
      setSaving(false);
    }
  }

  if (access.loading) {
    return <main className="min-h-screen px-6 py-7 text-white/45">Resolving Operations access…</main>;
  }

  if (!access.can?.administer) {
    return (
      <main className="min-h-screen px-6 py-7 text-white">
        <div className="mx-auto max-w-[1100px] rounded-[30px] border border-red-400/20 bg-red-500/[0.06] p-8">
          <div className="text-xs uppercase tracking-[0.28em] text-red-200">Access denied</div>
          <h1 className="mt-3 text-2xl font-semibold">Operations administration permission required</h1>
          <p className="mt-3 text-sm text-white/45">Only authorised Operations administrators can assign or revoke Operations roles.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-7 text-white">
      <div className="mx-auto max-w-[1540px]">
        <WorkspaceHeader
          workspace="Operations"
          title="Operations Access Control"
          description="Assign organisation-scoped Operations roles without duplicating identity, membership or People records."
          actions={(
            <button
              type="button"
              disabled={loading}
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/65 disabled:opacity-40"
            >
              <RefreshCw size={15} /> Refresh
            </button>
          )}
        />

        {error ? <div className="mb-5 rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm text-red-200">{error}</div> : null}
        {notice ? <div className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

        <section className="mb-5 rounded-[30px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.06] p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="text-[#D6A66A]" size={22} />
            <div>
              <div className="text-sm font-semibold">Assign canonical role</div>
              <div className="mt-1 text-xs text-white/40">Assignments apply only inside the selected organisation.</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">Select organisation user</option>
              {users.map((user) => <option key={user.user_id} value={user.user_id}>{userLabel(user)}</option>)}
            </select>
            <select
              value={selectedRoleCode}
              onChange={(event) => setSelectedRoleCode(event.target.value)}
              className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="">Select Operations role</option>
              {roles.map((role) => <option key={role.role_code} value={role.role_code}>{role.role_name}</option>)}
            </select>
            <button
              type="button"
              disabled={saving || !selectedUserId || !selectedRoleCode}
              onClick={() => changeRole("POST", { user_id: selectedUserId, role_code: selectedRoleCode })}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-5 py-3 text-sm text-[#D6A66A] disabled:opacity-40"
            >
              <UserPlus size={16} /> Assign
            </button>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Active assignments</div>
                <div className="mt-2 text-sm text-white/40">{loading ? "Loading…" : `${filteredAssignments.length} assignments`}</div>
              </div>
              <div className="flex w-full items-center rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-white/45 md:w-[340px]">
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assignments…" className="ml-3 w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
              </div>
            </div>

            <div className="space-y-2">
              {filteredAssignments.map((assignment) => {
                const user = userById.get(String(assignment.user_id));
                const role = assignment.operations_role || roleById.get(String(assignment.role_id));
                return (
                  <div key={assignment.id} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div>
                      <div className="text-sm font-semibold text-white">{user?.name || user?.email || assignment.user_id}</div>
                      <div className="mt-1 text-xs text-white/35">{role?.role_name || role?.role_code || "Unknown role"} · {user?.email || "No email"}</div>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => changeRole("DELETE", { user_id: assignment.user_id, role_code: role?.role_code })}
                      className="rounded-xl border border-red-400/20 bg-red-500/[0.06] p-2 text-red-200 disabled:opacity-40"
                      aria-label="Revoke Operations role"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
              {!loading && filteredAssignments.length === 0 ? <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/40">No active Operations role assignments.</div> : null}
            </div>
          </div>

          <aside className="rounded-[30px] border border-white/10 bg-white/[0.035] p-5">
            <div className="text-xs uppercase tracking-[0.28em] text-[#D6A66A]">Canonical roles</div>
            <div className="mt-4 space-y-3">
              {roles.map((role) => (
                <div key={role.role_code} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm font-semibold text-white">{role.role_name}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-white/30">{role.role_code}</div>
                  <p className="mt-3 text-xs leading-5 text-white/45">{role.description}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
