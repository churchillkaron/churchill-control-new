"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UserX,
  X,
} from "lucide-react";

const FALLBACK_ROLES = ["STAFF", "MANAGER", "OWNER"];

function prettyRole(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roleOptions, setRoleOptions] = useState(FALLBACK_ROLES);
  const [actingRole, setActingRole] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("STAFF");
  const [newPosition, setNewPosition] = useState("");

  async function loadUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/users/create", {
        method: "GET",
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to load staff access");
      }

      const nextRoles = Array.isArray(result.roleOptions) && result.roleOptions.length
        ? result.roleOptions
        : FALLBACK_ROLES;

      setUsers(result.staff || []);
      setRoleOptions(nextRoles);
      setNewRole((current) => nextRoles.includes(current) ? current : nextRoles[0]);
      setActingRole(result.actingRole || "");
      setOrganizationId(result.organizationId || "");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load staff access");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  const linkedCount = useMemo(
    () => users.filter((user) => Boolean(user.auth_user_id)).length,
    [users]
  );

  const activeCount = useMemo(
    () => users.filter((user) => user.active !== false).length,
    [users]
  );

  async function provisionAccess(payload, workKey) {
    setWorkingId(workKey);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to provision staff access");
      }

      setStatus(result.message || "Staff access provisioned.");
      await loadUsers();
      return true;
    } catch (provisionError) {
      setError(provisionError?.message || "Unable to provision staff access");
      return false;
    } finally {
      setWorkingId("");
    }
  }

  async function createUser() {
    if (!newName.trim() || !newEmail.trim() || !newRole) {
      setError("Name, email and role are required.");
      return;
    }

    const created = await provisionAccess(
      {
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        position: newPosition.trim() || null,
      },
      "create"
    );

    if (!created) return;

    setShowModal(false);
    setNewName("");
    setNewEmail("");
    setNewRole(roleOptions[0] || "STAFF");
    setNewPosition("");
  }

  async function sendAccess(user) {
    if (!user?.email) {
      setError("This staff account has no email address.");
      return;
    }

    await provisionAccess(
      {
        name: user.name || user.email,
        email: user.email,
        role: user.role || roleOptions[0] || "STAFF",
        position: user.position || user.department || null,
      },
      `access:${user.id}`
    );
  }

  async function setActive(user, active) {
    setWorkingId(`active:${user.id}`);
    setError("");
    setStatus("");

    try {
      const response = await fetch("/api/users/create", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: user.id, active }),
      });
      const result = await response.json();

      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Unable to update staff access");
      }

      setUsers((current) =>
        current.map((item) => (item.id === user.id ? result.staff : item))
      );
      setStatus(active ? "Staff access activated." : "Staff access deactivated.");
    } catch (updateError) {
      setError(updateError?.message || "Unable to update staff access");
    } finally {
      setWorkingId("");
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F6F3] p-4 text-[#1B1A18] md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-[26px] border border-black/[0.075] bg-white p-6 shadow-[0_12px_38px_rgba(31,27,20,0.045)]">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#A37849]">Administration · Identity & Access</div>
              <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.04em]">Staff Access</h1>
              <p className="mt-2 max-w-3xl text-[12px] leading-5 text-[#706B64]">
                Manage employee identity, organization membership and portal access from one canonical record. Roles come from this organization&apos;s real access model, not industry-specific platform constants.
              </p>
              <div className="mt-3 text-[10px] text-[#918B83]">
                {organizationId ? `Organization ${organizationId}` : "Organization context"} · Acting role {prettyRole(actingRole || "unknown")}
              </div>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={loadUsers} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/[0.09] bg-white px-3.5 text-[11px] font-medium text-[#4B4842] disabled:opacity-40">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button type="button" onClick={() => setShowModal(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1F1E1B] px-4 text-[11px] font-medium text-white">
                <Plus className="h-3.5 w-3.5" />
                Add staff
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Staff accounts" value={users.length} />
          <Metric label="Active access" value={activeCount} />
          <Metric label="Auth linked" value={linkedCount} />
        </section>

        {error ? <div className="rounded-xl border border-red-700/15 bg-red-50 px-4 py-3 text-[11px] text-red-800">{error}</div> : null}
        {status ? <div className="rounded-xl border border-emerald-700/15 bg-emerald-50 px-4 py-3 text-[11px] text-emerald-800">{status}</div> : null}

        <section className="overflow-hidden rounded-[22px] border border-black/[0.075] bg-white">
          <div className="hidden grid-cols-[1.5fr_.85fr_.9fr_.7fr_1.15fr] gap-4 border-b border-black/[0.06] bg-[#FAF9F7] px-5 py-3 text-[9px] font-medium uppercase tracking-[0.14em] text-[#827C74] lg:grid">
            <div>Employee</div><div>Role</div><div>Position</div><div>Access</div><div>Action</div>
          </div>

          {loading ? (
            <div className="p-6 text-[12px] text-[#817D76]">Loading staff access…</div>
          ) : users.length ? users.map((user) => (
            <div key={user.id} className="grid gap-4 border-b border-black/[0.055] px-5 py-4 last:border-b-0 lg:grid-cols-[1.5fr_.85fr_.9fr_.7fr_1.15fr] lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F5F2ED] text-[#A37849]"><UserRound className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-[#302D29]">{user.name || "Unnamed staff"}</div>
                    <div className="mt-1 flex items-center gap-1 truncate text-[10px] text-[#8A847C]"><Mail className="h-3 w-3" />{user.email || "No email"}</div>
                  </div>
                </div>
              </div>
              <div className="text-[11px] font-medium text-[#8B6238]">{prettyRole(user.role || "-")}</div>
              <div className="text-[11px] text-[#6F6A63]">{user.position || user.department || "—"}</div>
              <div>
                {user.auth_user_id ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-emerald-800"><ShieldCheck className="h-3 w-3" />Linked</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.08em] text-amber-800"><Mail className="h-3 w-3" />Not linked</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!user.auth_user_id ? (
                  <button type="button" disabled={workingId === `access:${user.id}` || !user.active} onClick={() => sendAccess(user)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#D6A66A]/35 bg-[#D6A66A]/10 px-3 text-[9px] font-medium text-[#805A32] disabled:opacity-40">
                    <KeyRound className="h-3 w-3" />{workingId === `access:${user.id}` ? "Sending…" : "Send access"}
                  </button>
                ) : null}
                <button type="button" disabled={workingId === `active:${user.id}`} onClick={() => setActive(user, !user.active)} className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[9px] font-medium disabled:opacity-40 ${user.active ? "border border-red-700/15 bg-red-50 text-red-800" : "border border-emerald-700/15 bg-emerald-50 text-emerald-800"}`}>
                  {user.active ? <UserX className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{user.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          )) : <div className="p-6 text-[12px] text-[#817D76]">No staff accounts found.</div>}
        </section>
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[24px] border border-black/[0.09] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#A37849]">Secure provisioning</div>
                <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em]">Add staff member</h2>
                <p className="mt-1 text-[11px] leading-5 text-[#77726A]">Create or link employee identity and organization membership.</p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} className="rounded-lg border border-black/[0.08] p-2 text-[#77716A]"><X className="h-4 w-4" /></button>
            </div>

            <div className="mt-5 space-y-4">
              <Field label="Name"><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Employee name" className="h-11 w-full rounded-xl border border-black/[0.09] bg-[#FCFBF9] px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></Field>
              <Field label="Email"><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder="employee@company.com" className="h-11 w-full rounded-xl border border-black/[0.09] bg-[#FCFBF9] px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Role">
                  <select value={newRole} onChange={(event) => setNewRole(event.target.value)} className="h-11 w-full rounded-xl border border-black/[0.09] bg-[#FCFBF9] px-3 text-[12px] outline-none focus:border-[#D6A66A]">
                    {roleOptions.map((role) => <option key={role} value={role}>{prettyRole(role)}</option>)}
                  </select>
                </Field>
                <Field label="Position"><input value={newPosition} onChange={(event) => setNewPosition(event.target.value)} placeholder="Optional job title" className="h-11 w-full rounded-xl border border-black/[0.09] bg-[#FCFBF9] px-3 text-[12px] outline-none focus:border-[#D6A66A]" /></Field>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={() => setShowModal(false)} className="h-11 flex-1 rounded-xl border border-black/[0.09] bg-white text-[11px] font-medium text-[#625D56]">Cancel</button>
              <button type="button" onClick={createUser} disabled={workingId === "create"} className="h-11 flex-1 rounded-xl bg-[#1F1E1B] text-[11px] font-medium text-white disabled:opacity-40">{workingId === "create" ? "Creating…" : "Create access"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-[20px] border border-black/[0.075] bg-white p-5"><div className="text-[9px] font-medium uppercase tracking-[0.14em] text-[#8A847C]">{label}</div><div className="mt-2 text-[26px] font-semibold tracking-[-0.035em]">{value}</div></div>;
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-2 block text-[9px] font-medium uppercase tracking-[0.14em] text-[#7B756D]">{label}</span>{children}</label>;
}
